import { describe, expect, it, vi } from 'vitest';
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

  it('passes validation when candidate folder contains matching project files', async () => {
    const candidate = createMockDirectory('atlas-app-relocated', [
      createMockFile('package.json'),
      createMockDirectory('src', [createMockFile('App.tsx')]),
    ]);

    await expect(validateRelocationCandidate(existingProject, candidate)).resolves.toBeUndefined();
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

  it('rejects empty candidate folder when existing project had files', async () => {
    const emptyFolder = createMockDirectory('empty-dir', []);

    await expect(validateRelocationCandidate(existingProject, emptyFolder)).rejects.toThrow(ProjectMismatchError);
  });
});
