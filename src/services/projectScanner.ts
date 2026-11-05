import type { AnalysisCategory, ProjectIndex, ProjectNode, ScanWarning } from '../domain/models';
import { aggregateDirectoryStats, calculateMetrics } from './metrics';
import { shouldIgnoreEntry } from './ignoreRules';
import { analysisCategoryFor, extensionOf, isAnalyzableText, isSensitiveTextFile, languageFor } from '../utils/fileTypes';
import { withDeterministicLayout } from './layout';

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
}

export class ScanLimitError extends Error {
  constructor(public readonly limit: number, public readonly discovered: number) {
    super(`This project exceeds NEXUS's ${limit.toLocaleString()}-entry safety limit. Narrow the project or add exclusions, then scan again.`);
    this.name = 'ScanLimitError';
  }
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const newProjectId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const stableNodeId = (projectId: string, path: string) => `node:${projectId}:${path}`;

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
  if (!picker) throw new Error('NEXUS local folder access requires a supported Chromium desktop browser with directory access.');
  return picker({ mode: 'read' });
}

export async function scanDirectoryHandle(handle: LocalDirectoryHandle, options: ScanOptions = {}): Promise<ProjectIndex> {
  const projectId = options.projectId ?? newProjectId();
  const maxTextFileBytes = options.maxTextFileBytes ?? 2 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 50_000;
  const nodes: ProjectNode[] = [];
  const warnings: ScanWarning[] = [];
  let discovered = 0;
  let analyzed = 0;

  const rootPath = handle.name;
  const rootId = stableNodeId(projectId, rootPath);
  nodes.push({
    id: rootId, projectId, parentId: null, name: handle.name, path: rootPath,
    kind: 'project', sizeBytes: 0, loc: 0, depth: 0,
  });

  async function walk(directory: LocalDirectoryHandle, parentId: string, parentPath: string, depth: number): Promise<void> {
    ensureNotAborted(options.signal);
    let entries: AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
    try {
      entries = directory.values();
    } catch (error) {
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
          try {
            const file = await entry.getFile();
            const analyzable = isAnalyzableText(file.name);
            const category = analysisCategoryFor(path, file.name);
            const sensitive = isSensitiveTextFile(file.name);
            let loc = 0;
            let analysisStatus: ProjectNode['analysisStatus'] = 'metadata-only';

            if (sensitive) {
              analysisStatus = 'skipped-sensitive';
            } else if (analyzable && !shouldAnalyzeCategory(category, options.analyzeCategories)) {
              analysisStatus = 'metadata-only';
            } else if (analyzable && file.size > maxTextFileBytes) {
              analysisStatus = 'skipped-large';
            } else if (analyzable) {
              const text = await file.text();
              loc = text.length === 0 ? 0 : text.split(/\r?\n/).length;
              analyzed += 1;
              analysisStatus = 'analyzed';
            }

            nodes.push({
              id: stableNodeId(projectId, path), projectId, parentId, name: file.name, path, kind: 'file',
              extension: extensionOf(file.name), language: languageFor(file.name), sizeBytes: file.size, loc,
              modifiedAt: file.lastModified, depth, analysisStatus,
            });
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
            warnings.push({ path, message: error instanceof Error ? error.message : 'File could not be read.' });
          }
        }

        options.onProgress?.({ discovered, analyzed, warnings: warnings.length, currentPath: path });
        if (discovered % 64 === 0) await yieldToBrowser();
      }
    } catch (error) {
      if (error instanceof ScanLimitError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      warnings.push({ path: parentPath, message: error instanceof Error ? error.message : 'Directory traversal failed.' });
    }
  }

  await walk(handle, rootId, rootPath, 1);
  ensureNotAborted(options.signal);
  const aggregated = aggregateDirectoryStats(nodes);
  const laidOut = withDeterministicLayout(aggregated);
  const metrics = calculateMetrics(laidOut);
  const now = Date.now();
  return {
    schemaVersion: 2,
    id: projectId,
    name: handle.name,
    rootPathLabel: handle.name,
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    source: 'local',
    nodes: laidOut,
    metrics,
    warnings,
  };
}
