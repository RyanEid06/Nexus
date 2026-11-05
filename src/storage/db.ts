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
    const record = await db.handles.get(projectId);
    return record?.handle;
  } catch (error) {
    console.error('Failed to retrieve project handle from IndexedDB:', error);
    throw new StorageError(
      `Database error retrieving folder handle: ${error instanceof Error ? error.message : 'Database error'}`,
      error
    );
  }
}

export async function findProjectIdForHandle(handle: LocalDirectoryHandle): Promise<string | undefined> {
  let existing: StoredHandle[];
  try {
    existing = await db.handles.toArray();
  } catch (error) {
    console.error('Failed to query stored handles from IndexedDB:', error);
    throw new StorageError(
      `Database error querying project handles: ${error instanceof Error ? error.message : 'Database error'}`,
      error
    );
  }

  for (const item of existing) {
    try {
      if (item.handle.isSameEntry && (await item.handle.isSameEntry(handle))) {
        return item.projectId;
      }
    } catch {
      // Stale or revoked handle permission on an individual entry is a normal browser state,
      // not a database failure; continue checking remaining items.
    }
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
  } catch (error) {
    if (error instanceof StorageError) throw error;
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
 * Uses multivariate structural fingerprinting (depth 1, depth 2, non-generic files)
 * without reading raw source file contents.
 */
export async function validateRelocationCandidate(
  existing: ProjectIndex,
  candidateHandle: LocalDirectoryHandle
): Promise<void> {
  // If stored handle exists and isSameEntry returns true, identity is confirmed
  try {
    const storedHandle = await getProjectHandle(existing.id);
    if (storedHandle?.isSameEntry && (await storedHandle.isSameEntry(candidateHandle))) {
      return;
    }
  } catch (err) {
    if (err instanceof StorageError) throw err;
    // Stored handle might be inaccessible or permission revoked; fall through to structural validation
  }

  // Inspect candidate directory entries safely (depth 1)
  const candidateNames = new Set<string>();
  const candidateDirs = new Map<string, LocalDirectoryHandle>();
  let count = 0;
  try {
    for await (const entry of candidateHandle.values()) {
      candidateNames.add(entry.name);
      if (entry.kind === 'directory') {
        candidateDirs.set(entry.name, entry as LocalDirectoryHandle);
      }
      count++;
      if (count > 200) break;
    }
  } catch (err) {
    throw new StorageError(
      `Cannot inspect candidate folder "${candidateHandle.name}": ${err instanceof Error ? err.message : 'Access error'}`,
      err
    );
  }

  if (candidateNames.size === 0) {
    throw new ProjectMismatchError(
      `Selected folder "${candidateHandle.name}" is empty and does not match project "${existing.name}". To open this folder, import it as a new project instead.`
    );
  }

  // Inspect depth-2 entries inside matching subdirectories without reading file contents
  const candidateDepth2Paths = new Set<string>();
  for (const [dirName, dirHandle] of candidateDirs) {
    const isMatchingDir = existing.nodes.some((n) => n.depth === 1 && n.kind === 'directory' && n.name === dirName);
    if (isMatchingDir && dirHandle.values) {
      let subCount = 0;
      try {
        for await (const subEntry of dirHandle.values()) {
          candidateDepth2Paths.add(`${dirName}/${subEntry.name}`);
          subCount++;
          if (subCount > 100) break;
        }
      } catch {
        // Subdirectory read error
      }
    }
  }

  // Get depth-1 and depth-2 nodes from existing project index
  const existingDepth1Nodes = existing.nodes.filter((n) => n.depth === 1);
  const existingDepth1Names = new Set(existingDepth1Nodes.map((n) => n.name));
  const existingDepth2Nodes = existing.nodes.filter((n) => n.depth === 2);
  const existingDepth2Paths = new Set(existingDepth2Nodes.map((n) => n.path));

  const matchedDepth1 = Array.from(existingDepth1Names).filter((name) => candidateNames.has(name));
  const matchedDepth2 = Array.from(existingDepth2Paths).filter((path) => candidateDepth2Paths.has(path));

  // Common generic names that appear in almost any JS/TS or code repository:
  const GENERIC_NAMES = new Set([
    'src',
    'package.json',
    'README.md',
    'readme.md',
    '.gitignore',
    'dist',
    'build',
    'public',
    'docs',
  ]);

  const nonGenericDepth1Matches = matchedDepth1.filter((name) => !GENERIC_NAMES.has(name));
  const rootNameMatches = Boolean(
    candidateHandle.name &&
    (candidateHandle.name.toLowerCase() === existing.name.toLowerCase() ||
     candidateHandle.name.toLowerCase() === existing.rootPathLabel.toLowerCase())
  );

  let isConfidentMatch = false;

  if (matchedDepth2.length >= 1) {
    // Structural internal files match!
    if (matchedDepth2.length >= 2 || matchedDepth1.length >= 2 || (existingDepth2Paths.size > 0 && matchedDepth2.length === existingDepth2Paths.size)) {
      isConfidentMatch = true;
    }
  } else if (nonGenericDepth1Matches.length >= 2) {
    // Multiple distinctive non-generic files at root matched
    isConfidentMatch = true;
  } else if (nonGenericDepth1Matches.length >= 1 && (matchedDepth1.length >= 3 || rootNameMatches)) {
    isConfidentMatch = true;
  } else if (existingDepth1Names.size > 0 && existingDepth2Paths.size === 0) {
    // Flat project with no subdirectories
    const matchRatio = matchedDepth1.length / existingDepth1Names.size;
    if (matchRatio >= 0.5 && nonGenericDepth1Matches.length >= 1) {
      isConfidentMatch = true;
    }
  }

  // Reject if not confident, or if ONLY generic names (src, package.json, README) matched without any depth-2 match
  if (!isConfidentMatch || (nonGenericDepth1Matches.length === 0 && matchedDepth2.length === 0)) {
    throw new ProjectMismatchError(
      `Selected folder "${candidateHandle.name}" does not match project "${existing.name}". Generic folder or file names (like src or package.json) are not sufficient to confirm identity. To open this folder, import it as a new project instead.`
    );
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
