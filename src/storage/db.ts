import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_PREFERENCES, type NexusPreferences, type ProjectIndex, type ProjectNode } from '../domain/models';
import type { LocalDirectoryHandle } from '../services/projectScanner';
import { aggregateDirectoryStats, calculateMetrics } from '../services/metrics';

type StoredProject = Omit<ProjectIndex, 'nodes'>;
interface StoredHandle { projectId: string; handle: LocalDirectoryHandle; }
interface StoredPreference { key: 'preferences'; value: NexusPreferences; }

class NexusDatabase extends Dexie {
  projects!: EntityTable<StoredProject, 'id'>;
  nodes!: EntityTable<ProjectNode, 'id'>;
  handles!: EntityTable<StoredHandle, 'projectId'>;
  preferences!: EntityTable<StoredPreference, 'key'>;

  constructor() {
    super('nexus-local');
    this.version(1).stores({
      projects: 'id, updatedAt, name, source',
      nodes: 'id, projectId, parentId, [projectId+parentId], path, kind',
    });
    this.version(2).stores({
      projects: 'id, updatedAt, name, source',
      nodes: 'id, projectId, parentId, [projectId+parentId], path, kind',
      handles: 'projectId',
      preferences: 'key',
    });
  }
}

export const db = new NexusDatabase();

export async function saveProject(project: ProjectIndex, handle?: LocalDirectoryHandle): Promise<void> {
  const { nodes, ...metadata } = project;
  await db.transaction('rw', db.projects, db.nodes, db.handles, async () => {
    await db.projects.put(metadata);
    await db.nodes.where('projectId').equals(project.id).delete();
    if (nodes.length) await db.nodes.bulkPut(nodes);
    if (handle) await db.handles.put({ projectId: project.id, handle });
  });
}

export async function loadProject(id: string): Promise<ProjectIndex | undefined> {
  const metadata = await db.projects.get(id) as StoredProject | undefined;
  if (!metadata) return undefined;
  let nodes = await db.nodes.where('projectId').equals(id).toArray();

  // Foundation schema v1 existed before analysis-status/recursive-metric fields.
  // Normalize old local indexes rather than crashing or showing obviously false folder stats.
  if ((metadata as Partial<ProjectIndex>).schemaVersion !== 2) {
    nodes = nodes.map((node) => node.kind === 'file'
      ? { ...node, analysisStatus: node.loc > 0 ? 'analyzed' : 'metadata-only' }
      : node);
    nodes = aggregateDirectoryStats(nodes);
    const metrics = calculateMetrics(nodes);
    metrics.dependencyEdges = (metadata.metrics as Partial<ProjectIndex['metrics']>)?.dependencyEdges ?? 0;
    return {
      ...(metadata as Omit<ProjectIndex, 'nodes' | 'schemaVersion' | 'metrics' | 'warnings'>),
      schemaVersion: 2,
      nodes,
      metrics,
      warnings: [],
    };
  }
  return { ...metadata, warnings: metadata.warnings ?? [], nodes };
}

export async function listProjects(): Promise<StoredProject[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
  return projects.map((project) => {
    if ((project as Partial<ProjectIndex>).schemaVersion === 2) return project;
    const legacy = project.metrics as ProjectIndex['metrics'] & { analyzedBytes?: number };
    const indexedBytes = legacy.indexedBytes ?? legacy.analyzedBytes ?? 0;
    return {
      ...project,
      schemaVersion: 2,
      warnings: project.warnings ?? [],
      metrics: {
        ...legacy,
        indexedBytes,
        analyzedTextBytes: legacy.analyzedTextBytes ?? indexedBytes,
        analyzedFiles: legacy.analyzedFiles ?? project.metrics.files,
        metadataOnlyFiles: legacy.metadataOnlyFiles ?? 0,
        skippedLargeFiles: legacy.skippedLargeFiles ?? 0,
        skippedSensitiveFiles: legacy.skippedSensitiveFiles ?? 0,
      },
    };
  });
}

export async function removeProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.nodes, db.handles, async () => {
    await db.projects.delete(id);
    await db.nodes.where('projectId').equals(id).delete();
    await db.handles.delete(id);
  });
}

export async function getProjectHandle(projectId: string): Promise<LocalDirectoryHandle | undefined> {
  return (await db.handles.get(projectId))?.handle;
}

export async function findProjectIdForHandle(handle: LocalDirectoryHandle): Promise<string | undefined> {
  const existing = await db.handles.toArray();
  for (const item of existing) {
    try {
      if (item.handle.isSameEntry && await item.handle.isSameEntry(handle)) return item.projectId;
    } catch {
      // A stale/invalid stored handle should not prevent importing another project.
    }
  }
  return undefined;
}

export async function getProjectPermission(projectId: string): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  const handle = await getProjectHandle(projectId);
  if (!handle?.queryPermission) return handle ? 'unavailable' : 'denied';
  try { return await handle.queryPermission({ mode: 'read' }); }
  catch { return 'denied'; }
}

export async function requestProjectPermission(projectId: string): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  const handle = await getProjectHandle(projectId);
  if (!handle?.requestPermission) return handle ? 'unavailable' : 'denied';
  try { return await handle.requestPermission({ mode: 'read' }); }
  catch { return 'denied'; }
}

export async function loadPreferences(): Promise<NexusPreferences> {
  return (await db.preferences.get('preferences'))?.value ?? DEFAULT_PREFERENCES;
}

export async function savePreferences(value: NexusPreferences): Promise<void> {
  await db.preferences.put({ key: 'preferences', value });
}
