import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db,
  listProjects,
  loadPreferences,
  loadProject,
  removeProject,
  savePreferences,
  saveProject,
  StorageError,
} from '../src/storage/db';
import type { ProjectIndex } from '../src/domain/models';

describe('Storage Truthfulness & Error Handling', () => {
  beforeEach(async () => {
    // Clear in-memory tables before each test
    await db.projects.clear();
    await db.nodes.clear();
    await db.handles.clear();
    await db.preferences.clear();
  });

  it('persists preferences and reads them back successfully', async () => {
    await savePreferences({
      maxTextFileBytes: 5 * 1024 * 1024,
      maxEntries: 10_000,
      analyzeSource: true,
      analyzeConfiguration: false,
      analyzeDocumentation: true,
      analyzeTests: false,
      reducedEffects: true,
    });

    const prefs = await loadPreferences();
    expect(prefs.maxTextFileBytes).toBe(5 * 1024 * 1024);
    expect(prefs.analyzeConfiguration).toBe(false);
    expect(prefs.reducedEffects).toBe(true);
  });

  it('throws StorageError on listProjects failure rather than returning empty array []', async () => {
    // Force db.projects.orderBy to reject
    const spy = vi.spyOn(db.projects, 'orderBy').mockImplementation(() => {
      throw new Error('IndexedDB disk read error');
    });

    await expect(listProjects()).rejects.toThrow(StorageError);
    spy.mockRestore();
  });

  it('throws StorageError on loadProject failure', async () => {
    const spy = vi.spyOn(db.projects, 'get').mockImplementation(() => {
      throw new Error('Database connection lost');
    });

    await expect(loadProject('some-id')).rejects.toThrow(StorageError);
    spy.mockRestore();
  });

  it('throws StorageError on savePreferences failure rather than swallowing it', async () => {
    const spy = vi.spyOn(db.preferences, 'put').mockImplementation(() => {
      throw new Error('QuotaExceededError: storage quota exceeded');
    });

    await expect(
      savePreferences({
        maxTextFileBytes: 1024,
        maxEntries: 100,
        analyzeSource: true,
        analyzeConfiguration: true,
        analyzeDocumentation: true,
        analyzeTests: true,
        reducedEffects: false,
      })
    ).rejects.toThrow(StorageError);

    spy.mockRestore();
  });

  it('throws StorageError on removeProject failure', async () => {
    const spy = vi.spyOn(db, 'transaction').mockImplementation(() => {
      throw new Error('Transaction abort error');
    });

    await expect(removeProject('proj-id')).rejects.toThrow(StorageError);
    spy.mockRestore();
  });

  it('saves and reloads a full project successfully', async () => {
    const project: ProjectIndex = {
      schemaVersion: 3,
      id: 'test-p1',
      name: 'Test Project',
      rootPathLabel: 'Test Project',
      createdAt: 1000,
      updatedAt: 2000,
      source: 'local',
      nodes: [
        { id: 'n1', projectId: 'test-p1', parentId: null, name: 'Test', path: '', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
        { id: 'n2', projectId: 'test-p1', parentId: 'n1', name: 'App.tsx', path: 'src/App.tsx', kind: 'file', sizeBytes: 50, loc: 5, depth: 1, analysisStatus: 'analyzed' },
      ],
      metrics: {
        files: 1,
        folders: 0,
        totalLoc: 5,
        indexedBytes: 50,
        analyzedTextBytes: 50,
        analyzedFiles: 1,
        metadataOnlyFiles: 0,
        skippedLargeFiles: 0,
        skippedSensitiveFiles: 0,
        languages: [],
        dependencyEdges: 0,
      },
      warnings: [],
      analysisConfig: {
        selectedCategories: ['source'],
        maxTextFileBytes: 1024 * 1024,
        maxEntries: 1000,
        scannerAnalysisVersion: 1,
        dependencyParserVersion: 2,
        dependencyResolverVersion: 2,
      },
    };

    await saveProject(project);

    const loaded = await loadProject('test-p1');
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('Test Project');
    expect(loaded?.nodes.length).toBe(2);
    expect(loaded?.analysisConfig?.maxTextFileBytes).toBe(1024 * 1024);

    const list = await listProjects();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('test-p1');
  });
});
