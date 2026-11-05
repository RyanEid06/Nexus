/**
 * NEXUS Project Scanner & Incremental Analysis Engine
 * Direct Chromium File System Access API, bounded concurrency, cancellation,
 * incremental fingerprint caching, and dependency extraction.
 */

import type { AnalysisCategory, DependencyEdge, ProjectIndex, ProjectNode, ScanWarning } from '../domain/models';
import { aggregateDirectoryStats, calculateMetrics } from './metrics';
import { shouldIgnoreEntry } from './ignoreRules';
import { analysisCategoryFor, extensionOf, isAnalyzableText, isSensitiveTextFile, languageFor } from '../utils/fileTypes';
import { withDeterministicLayout } from './layout';
import { buildDependencyGraph, parseTsConfigAliases, type TsConfigAliases } from './dependencies';

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

export interface ScanProgress {
  discovered: number;
  analyzed: number;
  reused: number;
  warnings: number;
  currentPath: string;
}

export interface ScanOptions {
  projectId?: string;
  createdAt?: number;
  maxTextFileBytes?: number;
  maxEntries?: number;
  analyzeCategories?: ReadonlySet<AnalysisCategory>;
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
  const projectId = options.projectId ?? options.previousProject?.id ?? newProjectId();
  const maxTextFileBytes = options.maxTextFileBytes ?? 2 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 50_000;
  const nodes: ProjectNode[] = [];
  const warnings: ScanWarning[] = [];
  let discovered = 0;
  let analyzed = 0;
  let reused = 0;

  // Build lookup index from previous analysis for incremental refresh
  const prevNodesByPath = new Map<string, ProjectNode>();
  const prevEdgesBySource = new Map<string, DependencyEdge[]>();

  if (options.previousProject) {
    for (const node of options.previousProject.nodes) {
      if (node.kind === 'file') {
        prevNodesByPath.set(node.path, node);
      }
    }
    if (options.previousProject.dependencies?.edges) {
      for (const edge of options.previousProject.dependencies.edges) {
        const list = prevEdgesBySource.get(edge.sourcePath) ?? [];
        list.push(edge);
        prevEdgesBySource.set(edge.sourcePath, list);
      }
    }
  }

  const rootPath = handle.name;
  const rootId = stableNodeId(projectId, rootPath);
  nodes.push({
    id: rootId,
    projectId,
    parentId: null,
    name: handle.name,
    path: rootPath,
    kind: 'project',
    sizeBytes: 0,
    loc: 0,
    depth: 0,
  });

  const filesForDependencyAnalysis: Array<{
    id: string;
    path: string;
    text?: string;
    cachedEdges?: DependencyEdge[];
  }> = [];

  const allFilePaths = new Set<string>();
  let tsConfigAliases: TsConfigAliases | undefined;

  async function walk(directory: LocalDirectoryHandle, parentId: string, parentPath: string, depth: number): Promise<void> {
    ensureNotAborted(options.signal);
    let entries: AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
    try {
      entries = directory.values();
    } catch (error) {
      // If root directory itself cannot be opened, that is fatal!
      if (depth === 1) {
        throw new RootAccessError(handle.name, error instanceof Error ? error.message : 'Permission denied or folder inaccessible');
      }
      warnings.push({ path: parentPath, message: error instanceof Error ? error.message : 'Directory could not be read.' });
      return;
    }

    try {
      for await (const entry of entries) {
        ensureNotAborted(options.signal);
        if (discovered >= maxEntries) throw new ScanLimitError(maxEntries, discovered);
        if (shouldIgnoreEntry(entry.name, entry.kind)) continue;
        const path = `${parentPath}/${entry.name}`;
        discovered += 1;

        if (entry.kind === 'directory') {
          const id = stableNodeId(projectId, path);
          nodes.push({ id, projectId, parentId, name: entry.name, path, kind: 'directory', sizeBytes: 0, loc: 0, depth });
          await walk(entry, id, path, depth + 1);
        } else {
          allFilePaths.add(path);
          const nodeId = stableNodeId(projectId, path);

          try {
            const file = await entry.getFile();
            const analyzable = isAnalyzableText(file.name);
            const category = analysisCategoryFor(path, file.name);
            const sensitive = isSensitiveTextFile(file.name);
            const prev = prevNodesByPath.get(path);

            let loc = 0;
            let analysisStatus: ProjectNode['analysisStatus'] = 'metadata-only';

            // Check if compiler aliases can be parsed from tsconfig/jsconfig
            if ((file.name === 'tsconfig.json' || file.name === 'jsconfig.json') && !tsConfigAliases && file.size < 512 * 1024) {
              try {
                const confText = await file.text();
                tsConfigAliases = parseTsConfigAliases(confText);
              } catch {
                // Ignore invalid json
              }
            }

            if (sensitive) {
              // Sensitive file: NEVER call file.text()!
              analysisStatus = 'skipped-sensitive';
            } else if (analyzable && !shouldAnalyzeCategory(category, options.analyzeCategories)) {
              analysisStatus = 'metadata-only';
            } else if (analyzable && file.size > maxTextFileBytes) {
              analysisStatus = 'skipped-large';
            } else if (analyzable) {
              // Incremental check: Can we reuse previous analysis?
              const canReuse =
                prev &&
                prev.modifiedAt === file.lastModified &&
                prev.sizeBytes === file.size &&
                prev.analysisStatus === 'analyzed';

              if (canReuse) {
                loc = prev.loc;
                analysisStatus = 'analyzed';
                reused += 1;
                // Reuse previous dependency edges
                const cachedEdges = prevEdgesBySource.get(path);
                filesForDependencyAnalysis.push({ id: nodeId, path, cachedEdges });
              } else {
                // Read fresh text
                const text = await file.text();
                loc = text.length === 0 ? 0 : text.split(/\r?\n/).length;
                analyzed += 1;
                analysisStatus = 'analyzed';
                filesForDependencyAnalysis.push({ id: nodeId, path, text });
              }
            }

            nodes.push({
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
            });
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
            warnings.push({ path, message: error instanceof Error ? error.message : 'File could not be read.' });
          }
        }

        options.onProgress?.({ discovered, analyzed, reused, warnings: warnings.length, currentPath: path });
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

  await walk(handle, rootId, rootPath, 1);
  ensureNotAborted(options.signal);

  // Compute dependency relationships
  const dependencyGraph = buildDependencyGraph(filesForDependencyAnalysis, allFilePaths, tsConfigAliases);

  // Map incoming and outgoing dependency counts
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
  return {
    schemaVersion: 3,
    id: projectId,
    name: handle.name,
    rootPathLabel: handle.name,
    createdAt: options.createdAt ?? options.previousProject?.createdAt ?? now,
    updatedAt: now,
    source: 'local',
    nodes: laidOut,
    metrics,
    warnings,
    dependencies: dependencyGraph,
  };
}
