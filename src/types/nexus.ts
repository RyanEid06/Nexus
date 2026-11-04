/**
 * NEXUS Core Type Definitions (Milestone 1)
 * Desktop-only, client-only, local-first architecture
 */

export interface NexusNode {
  /** Deterministic canonical ID: `${projectId}::${path}` */
  id: string;
  projectId: string;
  name: string;
  /** POSIX-normalized relative path from project root, e.g. "src/lib/tree.ts" */
  path: string;
  kind: 'file' | 'directory';
  extension: string;
  language: string;
  sizeBytes: number;
  depth: number;
  parentPath: string;
  childCount?: number;
  recursiveFileCount?: number;
  recursiveBytes?: number;
  children?: NexusNode[];
  fileHandle?: FileSystemFileHandle;
  rawFile?: File;
}

export interface NexusProject {
  id: string;
  name: string;
  openedAt: number;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  nodes: NexusNode[];
  rootNode: NexusNode;
  rootHandle?: FileSystemDirectoryHandle;
}

export interface LanguageStat {
  language: string;
  extension: string;
  count: number;
  bytes: number;
  color: string;
  percentage: number;
}

export interface FileFilterState {
  searchQuery: string;
  selectedExtension: string | 'ALL';
  hideDotFiles: boolean;
  hideNodeModules: boolean;
  sortBy: 'name' | 'size' | 'path';
  sortOrder: 'asc' | 'desc';
}

export interface RecentProjectMetadata {
  id: string;
  name: string;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  lastOpened: number;
}
