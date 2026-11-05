import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';
import type { ProjectIndex } from '../src/domain/models';

const mockProject: ProjectIndex = {
  schemaVersion: 3,
  id: 'test-p',
  name: 'Test Project',
  rootPathLabel: 'Test Project',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  source: 'demo',
  nodes: [
    { id: 'root', projectId: 'test-p', parentId: null, name: 'root', path: '', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
    { id: 'src', projectId: 'test-p', parentId: 'root', name: 'src', path: 'src', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
    { id: 'f1', projectId: 'test-p', parentId: 'src', name: 'App.tsx', path: 'src/App.tsx', kind: 'file', sizeBytes: 100, loc: 10, depth: 2 },
    { id: 'f2', projectId: 'test-p', parentId: 'src', name: 'api.ts', path: 'src/api.ts', kind: 'file', sizeBytes: 200, loc: 20, depth: 2 },
  ],
  metrics: {
    files: 2,
    folders: 1,
    totalLoc: 30,
    indexedBytes: 300,
    analyzedTextBytes: 300,
    analyzedFiles: 2,
    metadataOnlyFiles: 0,
    skippedLargeFiles: 0,
    skippedSensitiveFiles: 0,
    languages: [],
    dependencyEdges: 0,
  },
  warnings: [],
};

describe('App Store & Graph State', () => {
  beforeEach(() => {
    useAppStore.getState().clearProject();
  });

  it('initializes with 2D mode, hierarchy filter, mapFocusNodeId at root, and does not auto-expand depth-1 directories', () => {
    useAppStore.getState().setProject(mockProject);
    const state = useAppStore.getState();

    expect(state.mapMode).toBe('2d');
    expect(state.relationshipMode).toBe('hierarchy');
    expect(state.selectedNodeId).toBe('root');
    expect(state.mapFocusNodeId).toBe('root');
    expect(state.expandedNodeIds.has('root')).toBe(true);
    // Requirement #8: Depth-1 directories must NOT be auto-expanded
    expect(state.expandedNodeIds.has('src')).toBe(false);
  });

  it('switching 2D/3D preserves selected node and expanded branches', () => {
    useAppStore.getState().setProject(mockProject);
    useAppStore.getState().selectNode('f1');
    useAppStore.getState().expandNode('src');

    // Switch to 3D
    useAppStore.getState().setMapMode('3d');
    expect(useAppStore.getState().mapMode).toBe('3d');
    expect(useAppStore.getState().selectedNodeId).toBe('f1');
    expect(useAppStore.getState().expandedNodeIds.has('src')).toBe(true);

    // Switch back to 2D
    useAppStore.getState().setMapMode('2d');
    expect(useAppStore.getState().mapMode).toBe('2d');
    expect(useAppStore.getState().selectedNodeId).toBe('f1');
    expect(useAppStore.getState().expandedNodeIds.has('src')).toBe(true);
  });

  it('updates relationship mode correctly', () => {
    useAppStore.getState().setProject(mockProject);

    useAppStore.getState().setRelationshipMode('dependencies');
    expect(useAppStore.getState().relationshipMode).toBe('dependencies');

    useAppStore.getState().setRelationshipMode('both');
    expect(useAppStore.getState().relationshipMode).toBe('both');

    useAppStore.getState().setRelationshipMode('hierarchy');
    expect(useAppStore.getState().relationshipMode).toBe('hierarchy');
  });

  it('records exploration history without duplicate consecutive entries and supports Back/Forward', () => {
    useAppStore.getState().setProject(mockProject); // records 'root'

    useAppStore.getState().selectNode('src');
    useAppStore.getState().selectNode('src'); // Duplicate select should be ignored in history
    useAppStore.getState().selectNode('f1');
    useAppStore.getState().selectNode('f2');

    const history = useAppStore.getState().navigationHistory;
    const historyIds = history.map((h) => h.nodeId);
    expect(historyIds).toEqual(['root', 'src', 'f1', 'f2']);
    expect(useAppStore.getState().historyIndex).toBe(3);

    // Navigate back to f1
    useAppStore.getState().navigateBack();
    expect(useAppStore.getState().selectedNodeId).toBe('f1');
    expect(useAppStore.getState().historyIndex).toBe(2);

    // Navigate back to src
    useAppStore.getState().navigateBack();
    expect(useAppStore.getState().selectedNodeId).toBe('src');
    expect(useAppStore.getState().historyIndex).toBe(1);

    // Navigate forward to f1
    useAppStore.getState().navigateForward();
    expect(useAppStore.getState().selectedNodeId).toBe('f1');
    expect(useAppStore.getState().historyIndex).toBe(2);
  });

  it('opens and closes file viewer and tracks selection in history', () => {
    useAppStore.getState().setProject(mockProject);
    useAppStore.getState().openFileViewer('f1');

    expect(useAppStore.getState().previewFileId).toBe('f1');
    expect(useAppStore.getState().selectedNodeId).toBe('f1');

    useAppStore.getState().closeFileViewer();
    expect(useAppStore.getState().previewFileId).toBeNull();
  });

  it('strictly defaults to 2D when opening a new project even if previous project was in 3D (GEMINI.md Section 10)', () => {
    // Project 1
    useAppStore.getState().setProject(mockProject);
    useAppStore.getState().setMapMode('3d');
    expect(useAppStore.getState().mapMode).toBe('3d');

    // Project 2 opened
    const secondProject: ProjectIndex = {
      ...mockProject,
      id: 'project-2',
      name: 'Project 2',
    };
    useAppStore.getState().setProject(secondProject);

    // Must reset to 2D
    expect(useAppStore.getState().mapMode).toBe('2d');
  });

  it('restores full exploration context: page, file viewer, and selection on Back/Forward (GEMINI.md Section 9)', () => {
    useAppStore.getState().setProject(mockProject);
    expect(useAppStore.getState().page).toBe('graph');
    expect(useAppStore.getState().selectedNodeId).toBe('root');

    // 1. Go to search
    useAppStore.getState().setPage('search');
    expect(useAppStore.getState().page).toBe('search');

    // 2. Open file f1
    useAppStore.getState().openFileViewer('f1');
    expect(useAppStore.getState().previewFileId).toBe('f1');
    expect(useAppStore.getState().selectedNodeId).toBe('f1');

    // 3. Close file viewer and return to graph
    useAppStore.getState().closeFileViewer();
    useAppStore.getState().setPage('graph');
    useAppStore.getState().selectNode('src');
    expect(useAppStore.getState().selectedNodeId).toBe('src');
    expect(useAppStore.getState().page).toBe('graph');

    // 4. Navigate Back: should step back through graph page change, close viewer, to open f1
    useAppStore.getState().navigateBack(); // index 4: f1 on graph (viewer closed)
    useAppStore.getState().navigateBack(); // index 3: f1 on search (viewer closed)
    useAppStore.getState().navigateBack(); // index 2: f1 on search with file viewer open
    expect(useAppStore.getState().previewFileId).toBe('f1');
    expect(useAppStore.getState().selectedNodeId).toBe('f1');

    // 5. Navigate Back again: should return to search page before f1 was opened
    useAppStore.getState().navigateBack();
    expect(useAppStore.getState().page).toBe('search');
    expect(useAppStore.getState().previewFileId).toBeNull();

    // 6. Navigate Forward: returns to f1 preview
    useAppStore.getState().navigateForward();
    expect(useAppStore.getState().previewFileId).toBe('f1');
    expect(useAppStore.getState().selectedNodeId).toBe('f1');
  });
});

