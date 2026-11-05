import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_PREFERENCES, type NexusPreferences, type ProjectIndex, type ProjectNode } from '../domain/models';
import type { LocalDirectoryHandle } from '../services/projectScanner';
import { aggregateDirectoryStats, calculateMetrics } from '../services/metrics';

export type StoredProject = Omit<ProjectIndex, 'nodes'>;
export interface StoredHandle {
  projectId: string;
  handle: LocalDirectoryHandle;
}
export interface StoredPreference {
  key: 'preferences';
  value: NexusPreferences;
}

export type HandleConnectionStatus = 'connected' | 'permission-required' | 'unavailable';

export class StorageError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ProjectMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectMismatchError';
  }
}

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
    this.version(3).stores({
      projects: 'id, updatedAt, name, source',
      nodes: 'id, projectId, parentId, [projectId+parentId], path, kind',
      handles: 'projectId',
      preferences: 'key',
    });
  }
}

export const db = new NexusDatabase();

/**
 * Persists project index metadata, nodes, and directory handle.
 */
export async function saveProject(project: ProjectIndex, handle?: LocalDirectoryHandle): Promise<void> {
  const { nodes, ...metadata } = project;
  try {
    await db.transaction('rw', db.projects, db.nodes, db.handles, async () => {
      await db.projects.put({ ...metadata, schemaVersion: 3 });
      await db.nodes.where('projectId').equals(project.id).delete();
      if (nodes.length) await db.nodes.bulkPut(nodes);
      if (handle) await db.handles.put({ projectId: project.id, handle });
    });

    // Progressive enhancement: ask browser for persistent storage if available
    tryRequestStoragePersistence();
  } catch (error) {
    console.error('Failed to save project to IndexedDB:', error);
    throw new StorageError(
      `Failed to save project data locally: ${error instanceof Error ? error.message : 'Storage error'}`,
      error
    );
  }
}

/**
 * Re-associates a project with a new or relocated directory handle.
 */
export async function attachProjectHandle(projectId: string, handle: LocalDirectoryHandle): Promise<void> {
  try {
    await db.handles.put({ projectId, handle });
  } catch (error) {
    console.error('Failed to attach directory handle:', error);
    throw new StorageError(
      `Could not store folder reference: ${error instanceof Error ? error.message : 'Storage error'}`,
      error
    );
  }
}

/**
 * Loads a cached project by ID.
 * Returns cached index even if filesystem access is disconnected.
 */
export async function loadProject(id: string): Promise<ProjectIndex | undefined> {
  try {
    const metadata = (await db.projects.get(id)) as StoredProject | undefined;
    if (!metadata) return undefined;
    let nodes = await db.nodes.where('projectId').equals(id).toArray();

    // Migrate or normalize older schemas
    if ((metadata as Partial<ProjectIndex>).schemaVersion !== 3 && (metadata as Partial<ProjectIndex>).schemaVersion !== 2) {
      nodes = nodes.map((node) =>
        node.kind === 'file' ? { ...node, analysisStatus: node.loc > 0 ? 'analyzed' : 'metadata-only' } : node
      );
      nodes = aggregateDirectoryStats(nodes);
      const metrics = calculateMetrics(nodes);
      metrics.dependencyEdges = (metadata.metrics as Partial<ProjectIndex['metrics']>)?.dependencyEdges ?? 0;
      return {
        ...(metadata as Omit<ProjectIndex, 'nodes' | 'schemaVersion' | 'metrics' | 'warnings'>),
        schemaVersion: 3,
        nodes,
        metrics,
        warnings: [],
      };
    }
    return { ...metadata, warnings: metadata.warnings ?? [], nodes, schemaVersion: 3 };
  } catch (error) {
    console.error('Failed to load project from IndexedDB:', error);
    throw new StorageError(
      `Failed to load project: ${error instanceof Error ? error.message : 'Database read error'}`,
      error
    );
  }
}

/**
 * Lists all cached project cards sorted by recent update time.
 */
export async function listProjects(): Promise<StoredProject[]> {
  try {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
    return projects.map((project) => {
      if ((project as Partial<ProjectIndex>).schemaVersion === 3 || (project as Partial<ProjectIndex>).schemaVersion === 2) {
        return project;
      }
      const legacy = project.metrics as ProjectIndex['metrics'] & { analyzedBytes?: number };
      const indexedBytes = legacy.indexedBytes ?? legacy.analyzedBytes ?? 0;
      return {
        ...project,
        schemaVersion: 3,
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
  } catch (error) {
    console.error('Failed to list projects from IndexedDB:', error);
    throw new StorageError(
      `Failed to list projects from local database: ${error instanceof Error ? error.message : 'Database read error'}`,
      error
    );
  }
}

/**
 * Removes project index, nodes, and handle reference from NEXUS storage.
 * NEVER modifies or deletes user files on disk.
 */
export async function removeProject(id: string): Promise<void> {
  try {
    await db.transaction('rw', db.projects, db.nodes, db.handles, async () => {
      await db.projects.delete(id);
      await db.nodes.where('projectId').equals(id).delete();
      await db.handles.delete(id);
    });
  } catch (error) {
    console.error('Failed to remove project from IndexedDB:', error);
    throw new StorageError(
      `Failed to remove project: ${error instanceof Error ? error.message : 'Database error'}`,
      error
    );
  }
}

export async function getProjectHandle(projectId: string): Promise<LocalDirectoryHandle | undefined> {
  try {
    return (await db.handles.get(projectId))?.handle;
  } catch {
    return undefined;
  }
}

export async function findProjectIdForHandle(handle: LocalDirectoryHandle): Promise<string | undefined> {
  try {
    const existing = await db.handles.toArray();
    for (const item of existing) {
      try {
        if (item.handle.isSameEntry && (await item.handle.isSameEntry(handle))) return item.projectId;
      } catch {
        // A stale/invalid stored handle should not block importing
      }
    }
  } catch {
    // Ignore error
  }
  return undefined;
}

/**
 * Queries connection status of a stored project handle:
 * - 'connected': Handle is valid and read permission is granted.
 * - 'permission-required': Handle is valid but permission is 'prompt' or 'denied'.
 * - 'unavailable': No handle stored or handle is unresolvable.
 */
export async function getProjectHandleStatus(projectId: string): Promise<HandleConnectionStatus> {
  try {
    const handle = await getProjectHandle(projectId);
    if (!handle) return 'unavailable';
    if (!handle.queryPermission) return 'connected'; // fallback if browser doesn't implement queryPermission
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') return 'connected';
    return 'permission-required';
  } catch {
    return 'unavailable';
  }
}

/**
 * Requests permission for a stored project handle from a user gesture.
 */
export async function requestProjectPermission(projectId: string): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  const handle = await getProjectHandle(projectId);
  if (!handle?.requestPermission) return handle ? 'unavailable' : 'denied';
  try {
    return await handle.requestPermission({ mode: 'read' });
  } catch {
    return 'denied';
  }
}

export async function loadPreferences(): Promise<NexusPreferences> {
  try {
    return (await db.preferences.get('preferences'))?.value ?? DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Failed to load preferences from IndexedDB:', error);
    throw new StorageError(
      `Failed to load preferences: ${error instanceof Error ? error.message : 'Database read error'}`,
      error
    );
  }
}

export async function savePreferences(value: NexusPreferences): Promise<void> {
  try {
    await db.preferences.put({ key: 'preferences', value });
  } catch (error) {
    console.error('Failed to save preferences to IndexedDB:', error);
    throw new StorageError(
      `Failed to save preferences: ${error instanceof Error ? error.message : 'Database write error'}`,
      error
    );
  }
}

/**
 * Safely inspects a candidate directory before relocating a project to avoid
 * silently corrupting an existing project ID with an entirely unrelated repository.
 */
export async function validateRelocationCandidate(
  existing: ProjectIndex,
  candidateHandle: LocalDirectoryHandle
): Promise<void> {
  // If stored handle exists and isSameEntry returns true, identity is confirmed
  const storedHandle = await getProjectHandle(existing.id);
  if (storedHandle?.isSameEntry) {
    try {
      if (await storedHandle.isSameEntry(candidateHandle)) {
        return;
      }
    } catch {
      // Stored handle might be inaccessible
    }
  }

  // Inspect candidate directory entries safely
  const candidateNames = new Set<string>();
  let count = 0;
  try {
    for await (const entry of candidateHandle.values()) {
      candidateNames.add(entry.name);
      count++;
      if (count > 200) break;
    }
  } catch (err) {
    throw new StorageError(
      `Cannot inspect candidate folder "${candidateHandle.name}": ${err instanceof Error ? err.message : 'Access error'}`
    );
  }

  // Get depth-1 child names from existing project
  const existingDepth1 = existing.nodes
    .filter((n) => n.depth === 1)
    .map((n) => n.name);

  if (existingDepth1.length > 0) {
    const matched = existingDepth1.filter((name) => candidateNames.has(name));
    if (matched.length === 0) {
      throw new ProjectMismatchError(
        `Selected folder "${candidateHandle.name}" does not match project "${existing.name}". None of the expected project files or directories were found in this location.`
      );
    }
  }
}

function tryRequestStoragePersistence(): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => {});
    }
  } catch {
    // Ignore error
  }
}
