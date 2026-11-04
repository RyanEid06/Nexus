/**
 * Tree Builder & Aggregator for NEXUS
 * Pure functions for hierarchical conversion, recursive metrics, and filtering.
 */

import { FileFilterState, LanguageStat, NexusNode } from '../types/nexus';
import { classifyFile } from './fileClassifier';
import { createNodeId, normalizePath } from './identity';

export interface FlatFileInput {
  path: string; // e.g. "src/components/Header.tsx"
  sizeBytes: number;
  fileHandle?: FileSystemFileHandle;
  rawFile?: File;
}

/**
 * Builds a complete hierarchical NexusNode tree and flat node lookup list from flat file inputs.
 */
export function buildNexusTree(
  projectId: string,
  projectName: string,
  files: FlatFileInput[]
): { rootNode: NexusNode; allNodes: NexusNode[]; languageStats: LanguageStat[] } {
  const rootNode: NexusNode = {
    id: createNodeId(projectId, ''),
    projectId,
    name: projectName,
    path: '',
    kind: 'directory',
    extension: '',
    language: 'Project Root',
    sizeBytes: 0,
    depth: 0,
    parentPath: '',
    children: [],
    childCount: 0,
    recursiveFileCount: 0,
    recursiveBytes: 0,
  };

  const directoryMap = new Map<string, NexusNode>();
  directoryMap.set('', rootNode);
  const allNodes: NexusNode[] = [rootNode];

  // Helper to ensure all ancestor directories exist
  function getOrCreateDirectory(dirPath: string): NexusNode {
    const normalized = normalizePath(dirPath);
    if (directoryMap.has(normalized)) {
      return directoryMap.get(normalized)!;
    }

    const segments = normalized.split('/');
    const name = segments[segments.length - 1];
    const parentDir = segments.slice(0, -1).join('/');
    const parentNode = getOrCreateDirectory(parentDir);

    const dirNode: NexusNode = {
      id: createNodeId(projectId, normalized),
      projectId,
      name,
      path: normalized,
      kind: 'directory',
      extension: '',
      language: 'Directory',
      sizeBytes: 0,
      depth: segments.length,
      parentPath: parentNode.path,
      children: [],
      childCount: 0,
      recursiveFileCount: 0,
      recursiveBytes: 0,
    };

    parentNode.children = parentNode.children || [];
    parentNode.children.push(dirNode);
    parentNode.childCount = (parentNode.childCount || 0) + 1;

    directoryMap.set(normalized, dirNode);
    allNodes.push(dirNode);
    return dirNode;
  }

  // Populate files
  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!normalizedPath) continue;

    const segments = normalizedPath.split('/');
    const fileName = segments[segments.length - 1];
    const parentDir = segments.slice(0, -1).join('/');
    const parentNode = getOrCreateDirectory(parentDir);

    const classification = classifyFile(fileName);

    const fileNode: NexusNode = {
      id: createNodeId(projectId, normalizedPath),
      projectId,
      name: fileName,
      path: normalizedPath,
      kind: 'file',
      extension: classification.extension,
      language: classification.language,
      sizeBytes: file.sizeBytes,
      depth: segments.length,
      parentPath: parentNode.path,
      fileHandle: file.fileHandle,
      rawFile: file.rawFile,
    };

    parentNode.children = parentNode.children || [];
    parentNode.children.push(fileNode);
    parentNode.childCount = (parentNode.childCount || 0) + 1;
    allNodes.push(fileNode);
  }

  // Calculate recursive metrics bottom-up
  function calculateRecursiveMetrics(node: NexusNode): { files: number; bytes: number } {
    if (node.kind === 'file') {
      return { files: 1, bytes: node.sizeBytes };
    }

    let totalF = 0;
    let totalB = 0;

    if (node.children) {
      // Sort directories first, then alphabetical
      node.children.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const child of node.children) {
        const metrics = calculateRecursiveMetrics(child);
        totalF += metrics.files;
        totalB += metrics.bytes;
      }
    }

    node.recursiveFileCount = totalF;
    node.recursiveBytes = totalB;
    node.sizeBytes = totalB;
    return { files: totalF, bytes: totalB };
  }

  calculateRecursiveMetrics(rootNode);

  // Compute language distribution
  const languageAgg = new Map<string, { count: number; bytes: number; color: string; extension: string }>();
  let totalProjectBytes = 0;

  for (const node of allNodes) {
    if (node.kind === 'file') {
      totalProjectBytes += node.sizeBytes;
      const key = node.language;
      const current = languageAgg.get(key) || {
        count: 0,
        bytes: 0,
        color: classifyFile(node.name).color,
        extension: node.extension,
      };
      current.count += 1;
      current.bytes += node.sizeBytes;
      languageAgg.set(key, current);
    }
  }

  const languageStats: LanguageStat[] = Array.from(languageAgg.entries())
    .map(([lang, stat]) => ({
      language: lang,
      extension: stat.extension,
      count: stat.count,
      bytes: stat.bytes,
      color: stat.color,
      percentage: totalProjectBytes > 0 ? (stat.bytes / totalProjectBytes) * 100 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return { rootNode, allNodes, languageStats };
}

/**
 * Filters a NexusNode hierarchy based on user filter criteria.
 * Returns a cloned, filtered tree containing only matching branches.
 */
export function filterTree(node: NexusNode, filter: FileFilterState): NexusNode | null {
  const isDotFile = node.name.startsWith('.');
  const isNodeModules = node.path === 'node_modules' || node.path.includes('/node_modules') || node.path.startsWith('node_modules/');

  if (filter.hideDotFiles && isDotFile && node.depth > 0) {
    return null;
  }

  if (filter.hideNodeModules && isNodeModules) {
    return null;
  }

  if (node.kind === 'file') {
    // Search query match
    if (filter.searchQuery.trim()) {
      const q = filter.searchQuery.toLowerCase();
      const matchesName = node.name.toLowerCase().includes(q);
      const matchesPath = node.path.toLowerCase().includes(q);
      if (!matchesName && !matchesPath) {
        return null;
      }
    }

    // Extension match
    if (filter.selectedExtension !== 'ALL') {
      if (node.extension.toLowerCase() !== filter.selectedExtension.toLowerCase()) {
        return null;
      }
    }

    return { ...node };
  }

  // Directory node: filter children recursively
  const filteredChildren: NexusNode[] = [];
  if (node.children) {
    for (const child of node.children) {
      const filteredChild = filterTree(child, filter);
      if (filteredChild) {
        filteredChildren.push(filteredChild);
      }
    }
  }

  // If search or extension filter is active, only keep directory if it has matching children
  const hasActiveFilter = filter.searchQuery.trim().length > 0 || filter.selectedExtension !== 'ALL';
  if (hasActiveFilter && node.depth > 0 && filteredChildren.length === 0) {
    return null;
  }

  // Apply sorting
  filteredChildren.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'directory' ? -1 : 1;
    }
    const orderMult = filter.sortOrder === 'asc' ? 1 : -1;
    if (filter.sortBy === 'size') {
      return (a.sizeBytes - b.sizeBytes) * orderMult;
    }
    if (filter.sortBy === 'path') {
      return a.path.localeCompare(b.path) * orderMult;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true }) * orderMult;
  });

  return {
    ...node,
    children: filteredChildren,
    childCount: filteredChildren.length,
  };
}
