/**
 * NEXUS Project Scanner & Incremental Analysis Engine
 * Direct Chromium File System Access API, bounded concurrency, cancellation,
 * incremental fingerprint caching, off-thread worker dependency analysis,
 * and canonical project-relative path modeling.
 */

import {
  DEPENDENCY_PARSER_VERSION,
  DEPENDENCY_RESOLVER_VERSION,
  SCANNER_ANALYSIS_VERSION,
  type AnalysisCategory,
  type ProjectAnalysisConfig,
  type ProjectIndex,
  type ProjectNode,
  type RawSpecifier,
  type ScanProgress,
  type ScanWarning,
} from '../domain/models';
import { aggregateDirectoryStats, calculateMetrics } from './metrics';
import { shouldIgnoreEntry } from './ignoreRules';
import { analysisCategoryFor, extensionOf, isAnalyzableText, isSensitiveTextFile, languageFor } from '../utils/fileTypes';
import { withDeterministicLayout } from './layout';
import { parseTsConfigAliases, type TsConfigAliases } from '../utils/jsonc';
import { workerBridge } from './workerClient';
import type { BatchItem } from './analysisEngine';

export type { ScanProgress };

export class ProgressScheduler {
  private lastEmitTime = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latestState: ScanProgress | null = null;
  private isDone = false;

  constructor(
    private readonly onProgress?: (p: ScanProgress) => void,
    private readonly minIntervalMs = 100 // ~10 UI updates per second
  ) {}

  update(progress: ScanProgress) {
    if (this.isDone || !this.onProgress) return;

    // On phase change, flush any pending state from the prior phase, then emit new phase immediately
    if (this.latestState && this.latestState.phase !== progress.phase) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        this.onProgress(this.latestState);
      }
      this.latestState = progress;
      this.lastEmitTime = performance.now();
      this.onProgress(progress);
      return;
    }

    this.latestState = progress;
    const now = performance.now();
    const elapsed = now - this.lastEmitTime;

    if (elapsed >= this.minIntervalMs) {
      this.lastEmitTime = now;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.onProgress(this.latestState);
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.lastEmitTime = performance.now();
        if (this.latestState && !this.isDone) {
          this.onProgress?.(this.latestState);
        }
      }, this.minIntervalMs - elapsed);
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.latestState && this.onProgress && !this.isDone) {
      this.onProgress(this.latestState);
    }
  }

  cancel() {
    this.isDone = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

interface DirectoryEntryHandle {
  kind: 'file' | 'directory';
  name: string;
}

export interface LocalFileHandle extends DirectoryEntryHandle {
  kind: 'file';
  getFile: () => Promise<File>;
}

export interface LocalDirectoryHandle extends DirectoryEntryHandle {
  kind: 'directory';
  values: () => AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
  isSameEntry?: (other: LocalDirectoryHandle) => Promise<boolean>;
  queryPermission?: (descriptor?: { mode?: 'read' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: { mode?: 'read' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export interface ScanOptions {
  projectId?: string;
  createdAt?: number;
  maxTextFileBytes?: number;
  maxEntries?: number;
  analyzeCategories?: ReadonlySet<AnalysisCategory>;
  customExclusions?: string[];
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  previousProject?: ProjectIndex;
}

export class ScanLimitError extends Error {
  constructor(public readonly limit: number, public readonly discovered: number) {
    super(`This project exceeds NEXUS's ${limit.toLocaleString()}-entry safety limit. Narrow the project or add exclusions, then scan again.`);
    this.name = 'ScanLimitError';
  }
}

export class RootAccessError extends Error {
  constructor(public readonly folderName: string, message: string) {
    super(`Cannot access root folder "${folderName}": ${message}`);
    this.name = 'RootAccessError';
  }
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const newProjectId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const stableNodeId = (projectId: string, path: string) => `node:${projectId}:${path}`;

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Project analysis was canceled.', 'AbortError');
}

function shouldAnalyzeCategory(category: AnalysisCategory, selected?: ReadonlySet<AnalysisCategory>): boolean {
  return selected ? selected.has(category) : true;
}

export function supportsLocalDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickLocalProjectDirectory(): Promise<LocalDirectoryHandle> {
  const picker = (window as typeof window & { showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<LocalDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error('NEXUS direct local folder access requires a supported Chromium desktop browser (Chrome, Edge, Brave, Opera, Arc).');
  return picker({ mode: 'read' });
}

export async function scanDirectoryHandle(handle: LocalDirectoryHandle, options: ScanOptions = {}): Promise<ProjectIndex> {
  const previousProject = options.previousProject;
  const projectId = options.projectId ?? previousProject?.id ?? newProjectId();
  const scheduler = new ProgressScheduler(options.onProgress);

  try {
    // Honor persisted analysis configuration from previous project when not explicitly overridden
    const prevConfig = previousProject?.analysisConfig;
    const effectiveCategories: ReadonlySet<AnalysisCategory> =
      options.analyzeCategories !== undefined
        ? options.analyzeCategories
        : prevConfig?.selectedCategories
        ? new Set<AnalysisCategory>(prevConfig.selectedCategories)
        : new Set<AnalysisCategory>(['source', 'configuration', 'documentation', 'test']);

    const customExclusions = new Set<string>(
      options.customExclusions ?? prevConfig?.customExcludedPaths ?? []
    );

    const maxTextFileBytes = options.maxTextFileBytes ?? prevConfig?.maxTextFileBytes ?? 2 * 1024 * 1024;
    const maxEntries = options.maxEntries ?? prevConfig?.maxEntries ?? 50_000;

    const nodes: ProjectNode[] = [];
    const warnings: ScanWarning[] = [];
    let discovered = 0;
    let analyzed = 0;
    let reused = 0;

    // Build lookup index from previous analysis for incremental refresh
    const prevNodesByPath = new Map<string, ProjectNode>();
    if (previousProject) {
      for (const node of previousProject.nodes) {
        if (node.kind === 'file') {
          prevNodesByPath.set(node.path, node);
        }
      }
    }

    // Canonical root node: path is ""
    const rootId = stableNodeId(projectId, '');
    nodes.push({
      id: rootId,
      projectId,
      parentId: null,
      name: handle.name,
      path: '',
      kind: 'project',
      sizeBytes: 0,
      loc: 0,
      depth: 0,
    });

    const allFilePaths = new Set<string>();
    let tsConfigAliases: TsConfigAliases | undefined;

    interface FileWorkItem {
      entry: LocalFileHandle;
      path: string;
      parentId: string;
      depth: number;
    }

    const fileWorkItems: FileWorkItem[] = [];

    // Phase 1: Traversal and Discovery (Indeterminate)
    async function walk(directory: LocalDirectoryHandle, parentId: string, parentPath: string, depth: number): Promise<void> {
      ensureNotAborted(options.signal);
      let entries: AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
      try {
        entries = directory.values();
      } catch (error) {
        if (depth === 1) {
          throw new RootAccessError(handle.name, error instanceof Error ? error.message : 'Permission denied or folder inaccessible');
        }
        warnings.push({ path: parentPath, message: error instanceof Error ? error.message : 'Directory could not be read.' });
        return;
      }

      try {
        for await (const entry of entries) {
          ensureNotAborted(options.signal);
          // Canonical project-relative path
          const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
          if (shouldIgnoreEntry(entry.name, entry.kind, path, customExclusions)) continue;

          discovered += 1;
          if (discovered >= maxEntries) throw new ScanLimitError(maxEntries, discovered);

          if (entry.kind === 'directory') {
            const id = stableNodeId(projectId, path);
            const dirNode: ProjectNode = {
              id,
              projectId,
              parentId,
              name: entry.name,
              path,
              kind: 'directory',
              sizeBytes: 0,
              loc: 0,
              depth,
            };
            nodes.push(dirNode);
            await walk(entry, id, path, depth + 1);
          } else {
            allFilePaths.add(path);
            fileWorkItems.push({ entry, path, parentId, depth });
          }

          scheduler.update({
            phase: 'discovering',
            discovered,
            analyzed: 0,
            reused: 0,
            warnings: warnings.length,
            currentPath: path,
          });

          if (discovered % 32 === 0) await yieldToBrowser();
        }
      } catch (error) {
        if (error instanceof ScanLimitError || (error instanceof DOMException && error.name === 'AbortError') || error instanceof RootAccessError) {
          throw error;
        }
        if (depth === 1) {
          throw new RootAccessError(handle.name, error instanceof Error ? error.message : 'Directory traversal failed on root folder.');
        }
        warnings.push({ path: parentPath, message: error instanceof Error ? error.message : 'Directory traversal failed.' });
      }
    }

    await walk(handle, rootId, '', 1);
    ensureNotAborted(options.signal);

    // Bounded batch buffer for off-main-thread parsing
    let pendingBatch: BatchItem[] = [];
    const nodeById = new Map<string, ProjectNode>();

    async function flushPendingBatch(): Promise<void> {
      if (pendingBatch.length === 0) return;
      const batchToProcess = pendingBatch;
      pendingBatch = [];
      const results = await workerBridge.parseBatch(batchToProcess, options.signal);
      for (const res of results) {
        const node = nodeById.get(res.id);
        if (node) {
          node.loc = res.loc;
          node.rawSpecifiers = res.rawSpecifiers;
          node.dependencyParserVersion = DEPENDENCY_PARSER_VERSION;
        }
      }
    }

    // Phase 2: File Analysis (Determinate - totalFilesToProcess is known)
    const totalFilesToProcess = fileWorkItems.length;
    let processedFiles = 0;

    if (totalFilesToProcess === 0) {
      scheduler.update({
        phase: 'analyzing',
        discovered,
        totalFilesToProcess: 0,
        totalToAnalyze: 0,
        processedFiles: 0,
        analyzed: 0,
        reused: 0,
        warnings: warnings.length,
        currentPath: 'No files to process',
        percentage: 100,
      });
    }

    for (let i = 0; i < totalFilesToProcess; i += 1) {
      ensureNotAborted(options.signal);
      const { entry, path, parentId, depth } = fileWorkItems[i];
      const nodeId = stableNodeId(projectId, path);

      try {
        const file = await entry.getFile();
        const analyzable = isAnalyzableText(file.name);
        const category = analysisCategoryFor(path, file.name);
        const sensitive = isSensitiveTextFile(file.name);
        const isCategoryEnabled = shouldAnalyzeCategory(category, effectiveCategories);
        const prev = prevNodesByPath.get(path);

        let loc = 0;
        let analysisStatus: ProjectNode['analysisStatus'] = 'metadata-only';
        let rawSpecifiers: RawSpecifier[] | undefined;

        // Only parse tsconfig/jsconfig for aliases IF Configuration category is enabled
        if (
          (file.name === 'tsconfig.json' || file.name === 'jsconfig.json') &&
          !tsConfigAliases &&
          isCategoryEnabled &&
          file.size < 512 * 1024
        ) {
          try {
            const confText = await file.text();
            tsConfigAliases = parseTsConfigAliases(confText);
          } catch {
            // Ignore parse errors
          }
        }

        if (sensitive) {
          analysisStatus = 'skipped-sensitive';
        } else if (analyzable && !isCategoryEnabled) {
          analysisStatus = 'metadata-only';
        } else if (analyzable && file.size > maxTextFileBytes) {
          analysisStatus = 'skipped-large';
        } else if (analyzable) {
          const canReuse =
            prev &&
            prev.modifiedAt === file.lastModified &&
            prev.sizeBytes === file.size &&
            prev.analysisStatus === 'analyzed' &&
            prev.dependencyParserVersion === DEPENDENCY_PARSER_VERSION &&
            prev.rawSpecifiers !== undefined;

          if (canReuse) {
            loc = prev.loc;
            rawSpecifiers = prev.rawSpecifiers;
            analysisStatus = 'analyzed';
            reused += 1;
          } else {
            const text = await file.text();
            analysisStatus = 'analyzed';
            analyzed += 1;
            pendingBatch.push({ id: nodeId, path, text });

            if (pendingBatch.length >= 16) {
              await flushPendingBatch();
            }
          }
        }

        const fileNode: ProjectNode = {
          id: nodeId,
          projectId,
          parentId,
          name: file.name,
          path,
          kind: 'file',
          extension: extensionOf(file.name),
          language: languageFor(file.name),
          sizeBytes: file.size,
          loc,
          modifiedAt: file.lastModified,
          depth,
          analysisStatus,
          rawSpecifiers,
          dependencyParserVersion: rawSpecifiers ? DEPENDENCY_PARSER_VERSION : undefined,
        };

        nodes.push(fileNode);
        nodeById.set(nodeId, fileNode);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        warnings.push({ path, message: error instanceof Error ? error.message : 'File could not be read.' });
      } finally {
        processedFiles += 1;
      }

      scheduler.update({
        phase: 'analyzing',
        discovered,
        totalFilesToProcess,
        totalToAnalyze: totalFilesToProcess,
        processedFiles,
        analyzed,
        reused,
        warnings: warnings.length,
        currentPath: path,
        percentage: Math.min(100, Math.round((processedFiles / Math.max(1, totalFilesToProcess)) * 100)),
      });

      if (i % 32 === 0) await yieldToBrowser();
    }

    // Flush any remaining files in batch and flush progress to ensure 100% analyzing is emitted
    await flushPendingBatch();
    scheduler.flush();
    ensureNotAborted(options.signal);

    // Phase 3: Building Relationships (indeterminate progress - no fake percentages)
    scheduler.update({
      phase: 'building-relationships',
      discovered,
      totalFilesToProcess,
      totalToAnalyze: totalFilesToProcess,
      processedFiles,
      analyzed,
      reused,
      warnings: warnings.length,
      currentPath: 'Resolving module dependency relationships…',
      percentage: undefined,
    });

    const filesForResolution: Array<{ id: string; path: string; rawSpecifiers: RawSpecifier[] }> = [];
    for (const node of nodes) {
      if (node.kind === 'file') {
        filesForResolution.push({
          id: node.id,
          path: node.path,
          rawSpecifiers: node.rawSpecifiers ?? [],
        });
      }
    }

    const dependencyGraph = await workerBridge.resolveGraph(
      filesForResolution,
      Array.from(allFilePaths),
      tsConfigAliases,
      options.signal
    );

    // Phase 4: Finalizing Metrics & Layout (indeterminate progress - no fake percentages)
    scheduler.update({
      phase: 'finalizing',
      discovered,
      totalFilesToProcess,
      totalToAnalyze: totalFilesToProcess,
      processedFiles,
      analyzed,
      reused,
      warnings: warnings.length,
      currentPath: 'Finalizing local architectural index…',
      percentage: undefined,
    });

    const outgoingCounts = new Map<string, number>();
    const incomingCounts = new Map<string, number>();
    for (const edge of dependencyGraph.edges) {
      if (!edge.isExternal && edge.isResolved) {
        outgoingCounts.set(edge.sourceId, (outgoingCounts.get(edge.sourceId) ?? 0) + 1);
        if (edge.targetId) {
          incomingCounts.set(edge.targetId, (incomingCounts.get(edge.targetId) ?? 0) + 1);
        }
      }
    }

    for (const node of nodes) {
      node.outgoingCount = outgoingCounts.get(node.id) ?? 0;
      node.incomingCount = incomingCounts.get(node.id) ?? 0;
    }

    const aggregated = aggregateDirectoryStats(nodes);
    const laidOut = withDeterministicLayout(aggregated);
    const metrics = calculateMetrics(laidOut);

    metrics.dependencyEdges = dependencyGraph.edges.filter((e) => !e.isExternal && e.isResolved).length;
    metrics.externalPackagesCount = dependencyGraph.externalPackages.length;
    metrics.circularDependenciesCount = dependencyGraph.circularDependencies.length;

    const now = Date.now();
    const analysisConfig: ProjectAnalysisConfig = {
      selectedCategories: Array.from(effectiveCategories),
      maxTextFileBytes,
      maxEntries,
      scannerAnalysisVersion: SCANNER_ANALYSIS_VERSION,
      dependencyParserVersion: DEPENDENCY_PARSER_VERSION,
      dependencyResolverVersion: DEPENDENCY_RESOLVER_VERSION,
      customExcludedPaths: Array.from(customExclusions),
    };

    scheduler.flush();

    return {
      schemaVersion: 3,
      id: projectId,
      name: handle.name,
      rootPathLabel: handle.name,
      createdAt: options.createdAt ?? previousProject?.createdAt ?? now,
      updatedAt: now,
      source: 'local',
      nodes: laidOut,
      metrics,
      warnings,
      dependencies: dependencyGraph,
      analysisConfig,
    };
  } catch (error) {
    scheduler.cancel();
    throw error;
  }
}

