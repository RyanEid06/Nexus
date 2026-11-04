/**
 * Local File System Ingestion Engine for NEXUS
 * Direct local folder access via Chromium File System Access API
 * with webkitdirectory input fallback and drag-and-drop entry resolution.
 */

import { FlatFileInput } from './treeBuilder';

export interface ScanOptions {
  includeNodeModules?: boolean;
  maxFiles?: number;
  onProgress?: (scannedCount: number, currentDir: string) => void;
}

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  '.cache',
]);

/**
 * Checks if the standard Chromium File System Access API is supported.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/**
 * Reads local folder recursively via FileSystemDirectoryHandle (Chromium).
 */
export async function scanDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  options: ScanOptions = {}
): Promise<FlatFileInput[]> {
  const results: FlatFileInput[] = [];
  const max = options.maxFiles || 15000;
  const includeNodeModules = options.includeNodeModules ?? false;

  async function walk(handle: FileSystemDirectoryHandle, currentRelPath: string): Promise<void> {
    if (results.length >= max) return;

    // Use async iterator on directory handle
    for await (const entry of (handle as unknown as AsyncIterable<FileSystemHandle>)) {
      if (results.length >= max) break;

      const entryPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;

      if (entry.kind === 'directory') {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        if (!includeNodeModules && entry.name === 'node_modules') {
          continue;
        }

        if (options.onProgress) {
          options.onProgress(results.length, entryPath);
        }

        const subDirHandle = entry as unknown as FileSystemDirectoryHandle;
        await walk(subDirHandle, entryPath);
      } else if (entry.kind === 'file') {
        if (entry.name === '.DS_Store' || entry.name === 'Thumbs.db') {
          continue;
        }

        try {
          const fileHandle = entry as unknown as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          results.push({
            path: entryPath,
            sizeBytes: file.size,
            fileHandle,
            rawFile: file,
          });
        } catch {
          // File may have been locked or deleted; continue
        }
      }
    }
  }

  await walk(rootHandle, '');
  return results;
}

/**
 * Ingests files selected via webkitdirectory input (Universal Desktop Fallback).
 */
export function scanFileList(fileList: FileList, options: ScanOptions = {}): FlatFileInput[] {
  const results: FlatFileInput[] = [];
  const max = options.maxFiles || 15000;
  const includeNodeModules = options.includeNodeModules ?? false;

  for (let i = 0; i < fileList.length; i++) {
    if (results.length >= max) break;
    const file = fileList[i];
    
    // webkitRelativePath format is "rootFolder/src/index.ts"
    const rel = file.webkitRelativePath || file.name;
    const parts = rel.split('/');
    // Strip the outer folder name if webkitRelativePath has it
    const normalizedPath = parts.length > 1 ? parts.slice(1).join('/') : file.name;

    if (!includeNodeModules && normalizedPath.includes('node_modules/')) {
      continue;
    }
    if (normalizedPath.includes('.git/') || normalizedPath.startsWith('.git')) {
      continue;
    }
    if (file.name === '.DS_Store' || file.name === 'Thumbs.db') {
      continue;
    }

    results.push({
      path: normalizedPath,
      sizeBytes: file.size,
      rawFile: file,
    });
  }

  return results;
}

/**
 * Recursively parses drag-and-drop DataTransferItem directory entries.
 */
export async function scanDataTransferItemList(
  items: DataTransferItemList,
  options: ScanOptions = {}
): Promise<{ projectName: string; files: FlatFileInput[] }> {
  const results: FlatFileInput[] = [];
  const max = options.maxFiles || 15000;
  const includeNodeModules = options.includeNodeModules ?? false;
  let detectedProjectName = 'Project';

  type WebkitEntry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    fullPath: string;
    createReader?: () => { readEntries: (success: (entries: WebkitEntry[]) => void, error: (err: unknown) => void) => void };
    file?: (success: (file: File) => void, error: (err: unknown) => void) => void;
  };

  async function readDirectoryEntry(dirEntry: WebkitEntry, relPath: string): Promise<void> {
    if (!dirEntry.createReader) return;
    const reader = dirEntry.createReader();

    const readBatch = (): Promise<WebkitEntry[]> => {
      return new Promise((resolve) => {
        reader.readEntries(
          (entries) => resolve(entries),
          () => resolve([])
        );
      });
    };

    let entries: WebkitEntry[] = await readBatch();
    while (entries.length > 0 && results.length < max) {
      for (const entry of entries) {
        if (results.length >= max) break;
        const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
          if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
          if (!includeNodeModules && entry.name === 'node_modules') continue;
          await readDirectoryEntry(entry, entryRel);
        } else if (entry.isFile && entry.file) {
          if (entry.name === '.DS_Store' || entry.name === 'Thumbs.db') continue;
          await new Promise<void>((resolve) => {
            entry.file!(
              (file) => {
                results.push({
                  path: entryRel,
                  sizeBytes: file.size,
                  rawFile: file,
                });
                resolve();
              },
              () => resolve()
            );
          });
        }
      }
      entries = await readBatch();
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = (item as unknown as { webkitGetAsEntry?: () => WebkitEntry | null }).webkitGetAsEntry?.();
    if (entry) {
      if (entry.isDirectory) {
        detectedProjectName = entry.name;
        await readDirectoryEntry(entry, '');
      } else if (entry.isFile && entry.file) {
        await new Promise<void>((resolve) => {
          entry.file!(
            (file) => {
              results.push({
                path: file.name,
                sizeBytes: file.size,
                rawFile: file,
              });
              resolve();
            },
            () => resolve()
          );
        });
      }
    }
  }

  return { projectName: detectedProjectName, files: results };
}

/**
 * Safely reads file text content with UTF-8 decoding and size threshold protection (max 2MB preview).
 */
export async function readFileText(
  fileHandle?: FileSystemFileHandle,
  rawFile?: File
): Promise<{ text: string | null; isBinary: boolean; sizeBytes: number; error?: string }> {
  try {
    let file = rawFile;
    if (!file && fileHandle) {
      file = await fileHandle.getFile();
    }
    if (!file) {
      return { text: null, isBinary: false, sizeBytes: 0, error: 'File handle inaccessible' };
    }

    const sizeBytes = file.size;
    // Don't attempt to load files larger than 2.5MB into text preview
    if (sizeBytes > 2.5 * 1024 * 1024) {
      return {
        text: null,
        isBinary: false,
        sizeBytes,
        error: `File is too large for live preview (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB). Maximum text preview is 2.5 MB.`,
      };
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Quick null byte check for binary files (images, executables, compiled bytecode)
    let isBinary = false;
    const checkLen = Math.min(bytes.length, 1024);
    for (let i = 0; i < checkLen; i++) {
      if (bytes[i] === 0) {
        isBinary = true;
        break;
      }
    }

    if (isBinary) {
      return { text: null, isBinary: true, sizeBytes };
    }

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(buffer);
    return { text, isBinary: false, sizeBytes };
  } catch (err: unknown) {
    return {
      text: null,
      isBinary: false,
      sizeBytes: 0,
      error: err instanceof Error ? err.message : 'Failed to read file',
    };
  }
}
