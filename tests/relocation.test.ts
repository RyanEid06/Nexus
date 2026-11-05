import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  ProjectMismatchError,
  validateRelocationCandidate,
} from '../src/storage/db';
import type { LocalDirectoryHandle, LocalFileHandle } from '../src/services/projectScanner';
import type { ProjectIndex } from '../src/domain/models';

function createMockDirectory(name: string, entries: Array<LocalFileHandle | LocalDirectoryHandle>, isSameEntry?: (other: LocalDirectoryHandle) => Promise<boolean>): LocalDirectoryHandle {
  return {
    kind: 'directory',
    name,
    isSameEntry,
    values: async function* () {
      for (const entry of entries) {
        yield entry;
      }
    },
  };
}

function createMockFile(name: string): LocalFileHandle {
  return {
    kind: 'file',
    name,
    getFile: vi.fn().mockResolvedValue({
      name,
      size: 100,
      lastModified: 1000,
      text: vi.fn().mockResolvedValue('test'),
    }),
  };
}

describe('relocation safety', () => {
  const existingProject: ProjectIndex = {
    schemaVersion: 3,
    id: 'proj-123',
    name: 'atlas-app',
    rootPathLabel: 'atlas-app',
    createdAt: 1000,
    updatedAt: 1000,
    source: 'local',
    nodes: [
      { id: 'root', projectId: 'proj-123', parentId: null, name: 'atlas-app', path: '', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
      { id: 'pkg', projectId: 'proj-123', parentId: 'root', name: 'package.json', path: 'package.json', kind: 'file', sizeBytes: 200, loc: 10, depth: 1 },
      { id: 'src', projectId: 'proj-123', parentId: 'root', name: 'src', path: 'src', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
      { id: 'app', projectId: 'proj-123', parentId: 'src', name: 'App.tsx', path: 'src/App.tsx', kind: 'file', sizeBytes: 500, loc: 30, depth: 2 },
    ],
    metrics: {
      files: 2,
      folders: 1,
      totalLoc: 40,
      indexedBytes: 700,
      analyzedTextBytes: 700,
      analyzedFiles: 2,
      metadataOnlyFiles: 0,
      skippedLargeFiles: 0,
      skippedSensitiveFiles: 0,
      languages: [],
      dependencyEdges: 0,
    },
    warnings: [],
  };

  beforeEach(async () => {
    const { db } = await import('../src/storage/db');
    await db.projects.clear();
    await db.nodes.clear();
    await db.handles.clear();
  });

  it('passes validation when candidate folder contains matching project files', async () => {
    const candidate = createMockDirectory('atlas-app-relocated', [
      createMockFile('package.json'),
      createMockDirectory('src', [createMockFile('App.tsx')]),
    ]);

    await expect(validateRelocationCandidate(existingProject, candidate)).resolves.toBeUndefined();
  });

  it('passes validation immediately when isSameEntry returns true', async () => {
    const { db } = await import('../src/storage/db');
    const sameEntryFn = vi.fn().mockResolvedValue(true);
    const candidate = createMockDirectory('atlas-app-moved', [], sameEntryFn);

    const storedHandle = {
      kind: 'directory' as const,
      name: 'atlas-app',
      isSameEntry: sameEntryFn,
      values: async function* () {},
    };

    const spy = vi.spyOn(db.handles, 'get').mockResolvedValue({
      projectId: existingProject.id,
      handle: storedHandle as any,
    });

    await expect(validateRelocationCandidate(existingProject, candidate)).resolves.toBeUndefined();
    expect(sameEntryFn).toHaveBeenCalledWith(candidate);
    spy.mockRestore();
  });

  it('rejects candidate folder when it contains none of the existing project files', async () => {
    // Unrelated repo selected by mistake: e.g. python project
    const wrongRepo = createMockDirectory('python-service', [
      createMockFile('main.py'),
      createMockFile('requirements.txt'),
      createMockDirectory('venv', []),
    ]);

    await expect(validateRelocationCandidate(existingProject, wrongRepo)).rejects.toThrow(ProjectMismatchError);
  });

  it('rejects unrelated JS repository that also has src and package.json but different files', async () => {
    // Both repositories share generic names ('src', 'package.json'),
    // but the candidate contains server-side express files, not atlas-app's App.tsx
    const unrelatedJsRepo = createMockDirectory('unrelated-express-api', [
      createMockFile('package.json'),
      createMockDirectory('src', [createMockFile('server.js'), createMockFile('routes.js')]),
    ]);

    await expect(validateRelocationCandidate(existingProject, unrelatedJsRepo)).rejects.toThrow(ProjectMismatchError);
  });

  it('rejects candidate sharing ONLY generic "src" folder', async () => {
    const srcOnlyCandidate = createMockDirectory('other-project', [
      createMockDirectory('src', [createMockFile('main.c'), createMockFile('utils.c')]),
    ]);

    await expect(validateRelocationCandidate(existingProject, srcOnlyCandidate)).rejects.toThrow(ProjectMismatchError);
  });

  it('rejects candidate sharing ONLY generic "package.json"', async () => {
    const pkgOnlyCandidate = createMockDirectory('other-lib', [
      createMockFile('package.json'),
      createMockDirectory('lib', [createMockFile('index.js')]),
    ]);

    await expect(validateRelocationCandidate(existingProject, pkgOnlyCandidate)).rejects.toThrow(ProjectMismatchError);
  });

  it('rejects empty candidate folder when existing project had files', async () => {
    const emptyFolder = createMockDirectory('empty-dir', []);

    await expect(validateRelocationCandidate(existingProject, emptyFolder)).rejects.toThrow(ProjectMismatchError);
  });

  it('leaves existing project metadata, nodes, and directory handle completely untouched on validation failure', async () => {
    const dbModule = await import('../src/storage/db');
    const originalHandle = createMockDirectory('atlas-original', [
      createMockFile('package.json'),
      createMockDirectory('src', [createMockFile('App.tsx')]),
    ]);

    // Save existing project in database without handle
    await dbModule.saveProject(existingProject);
    const getHandleSpy = vi.spyOn(dbModule, 'getProjectHandle').mockResolvedValue(originalHandle);

    // Attempt relocation with mismatched repo
    const mismatchedCandidate = createMockDirectory('random-repo', [
      createMockFile('go.mod'),
      createMockFile('main.go'),
    ]);

    await expect(dbModule.validateRelocationCandidate(existingProject, mismatchedCandidate)).rejects.toThrow(ProjectMismatchError);

    // Verify stored project, nodes, and handle are completely untouched in IndexedDB
    const stored = await dbModule.loadProject(existingProject.id);
    expect(stored).toBeDefined();
    expect(stored?.name).toBe('atlas-app');
    expect(stored?.nodes.length).toBe(existingProject.nodes.length);

    const storedHandle = await dbModule.getProjectHandle(existingProject.id);
    expect(storedHandle?.name).toBe('atlas-original');
    getHandleSpy.mockRestore();
  });
});
