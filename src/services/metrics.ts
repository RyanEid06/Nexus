import type { LanguageStat, ProjectMetrics, ProjectNode } from '../domain/models';

export function aggregateDirectoryStats(nodes: ProjectNode[]): ProjectNode[] {
  const next = nodes.map((node) => ({ ...node }));
  const byId = new Map(next.map((node) => [node.id, node]));
  const children = new Map<string, ProjectNode[]>();

  for (const node of next) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  const visit = (node: ProjectNode): { files: number; folders: number; size: number; loc: number } => {
    if (node.kind === 'file') return { files: 1, folders: 0, size: node.sizeBytes, loc: node.loc };
    let files = 0;
    let folders = 0;
    let size = 0;
    let loc = 0;
    for (const child of children.get(node.id) ?? []) {
      const totals = visit(child);
      files += totals.files;
      folders += totals.folders + (child.kind === 'directory' ? 1 : 0);
      size += totals.size;
      loc += totals.loc;
    }
    node.descendantFiles = files;
    node.descendantFolders = folders;
    node.sizeBytes = size;
    node.loc = loc;
    return { files, folders, size, loc };
  };

  for (const root of next.filter((node) => !node.parentId)) visit(root);
  return [...byId.values()];
}

export function calculateMetrics(nodes: ProjectNode[]): ProjectMetrics {
  const files = nodes.filter((node) => node.kind === 'file');
  const folders = nodes.filter((node) => node.kind === 'directory');
  const totalLoc = files.reduce((sum, node) => sum + node.loc, 0);
  const indexedBytes = files.reduce((sum, node) => sum + node.sizeBytes, 0);
  const analyzedTextBytes = files.reduce((sum, node) => sum + (node.analysisStatus === 'analyzed' ? node.sizeBytes : 0), 0);
  const analyzedFiles = files.filter((node) => node.analysisStatus === 'analyzed').length;
  const metadataOnlyFiles = files.filter((node) => node.analysisStatus === 'metadata-only' || !node.analysisStatus).length;
  const skippedLargeFiles = files.filter((node) => node.analysisStatus === 'skipped-large').length;
  const skippedSensitiveFiles = files.filter((node) => node.analysisStatus === 'skipped-sensitive').length;
  const byLanguage = new Map<string, { files: number; loc: number }>();

  for (const file of files) {
    if (!file.language) continue;
    const current = byLanguage.get(file.language) ?? { files: 0, loc: 0 };
    current.files += 1;
    current.loc += file.loc;
    byLanguage.set(file.language, current);
  }

  const languages: LanguageStat[] = [...byLanguage.entries()]
    .map(([language, value]) => ({
      language,
      files: value.files,
      loc: value.loc,
      percentage: totalLoc ? (value.loc / totalLoc) * 100 : 0,
    }))
    .sort((a, b) => b.loc - a.loc);

  return {
    files: files.length,
    folders: folders.length,
    totalLoc,
    indexedBytes,
    analyzedTextBytes,
    analyzedFiles,
    metadataOnlyFiles,
    skippedLargeFiles,
    skippedSensitiveFiles,
    languages,
    dependencyEdges: 0,
  };
}
