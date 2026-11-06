import { create } from 'zustand';
import type { AppPage, ProjectIndex } from '../domain/models';

export type MapMode = '2d' | '3d';
export type RelationshipFilterMode = 'hierarchy' | 'dependencies' | 'both';

export interface HistoryEntry {
  nodeId: string | null;
  mapFocusNodeId: string | null;
  page: AppPage;
  previewFileId: string | null;
  mapMode: MapMode;
}

interface AppState {
  page: AppPage;
  project: ProjectIndex | null;
  selectedNodeId: string | null;
  mapFocusNodeId: string | null;
  mapMode: MapMode;
  relationshipMode: RelationshipFilterMode;
  expandedNodeIds: Set<string>;
  previewFileId: string | null;
  isInspectorCollapsed: boolean;
  navigationHistory: HistoryEntry[];
  historyIndex: number;

  setPage: (page: AppPage) => void;
  setProject: (project: ProjectIndex) => void;
  clearProject: () => void;
  selectNode: (id: string | null, recordHistory?: boolean) => void;
  setMapFocusNodeId: (id: string | null, recordHistory?: boolean) => void;
  drillDownNode: (id: string) => void;
  navigateUpToParentFocus: () => void;
  revealNodeOnMap: (nodeId: string) => void;
  setMapMode: (mode: MapMode) => void;
  setRelationshipMode: (mode: RelationshipFilterMode) => void;
  toggleExpandNode: (id: string) => void;
  expandNode: (id: string) => void;
  collapseNode: (id: string) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  toggleInspector: () => void;
  openFileViewer: (nodeId: string) => void;
  closeFileViewer: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
}

const MAX_HISTORY = 50;

function pushHistoryEntry(
  history: HistoryEntry[],
  currentIndex: number,
  newEntry: HistoryEntry
): { navigationHistory: HistoryEntry[]; historyIndex: number } {
  const currentHistory = history.slice(0, currentIndex + 1);
  const lastEntry = currentHistory[currentHistory.length - 1];

  if (
    lastEntry &&
    lastEntry.nodeId === newEntry.nodeId &&
    lastEntry.mapFocusNodeId === newEntry.mapFocusNodeId &&
    lastEntry.page === newEntry.page &&
    lastEntry.previewFileId === newEntry.previewFileId &&
    lastEntry.mapMode === newEntry.mapMode
  ) {
    return { navigationHistory: currentHistory, historyIndex: currentHistory.length - 1 };
  }

  const updatedHistory = [...currentHistory, newEntry].slice(-MAX_HISTORY);
  return {
    navigationHistory: updatedHistory,
    historyIndex: updatedHistory.length - 1,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'projects',
  project: null,
  selectedNodeId: null,
  mapFocusNodeId: null,
  mapMode: '2d',
  relationshipMode: 'hierarchy',
  expandedNodeIds: new Set<string>(),
  previewFileId: null,
  isInspectorCollapsed: false,
  navigationHistory: [],
  historyIndex: -1,

  setPage: (page) => {
    const state = get();
    if (state.page === page) return;

    const { navigationHistory, historyIndex } = pushHistoryEntry(
      state.navigationHistory,
      state.historyIndex,
      {
        nodeId: state.selectedNodeId,
        mapFocusNodeId: state.mapFocusNodeId,
        page,
        previewFileId: state.previewFileId,
        mapMode: state.mapMode,
      }
    );

    set({
      page,
      navigationHistory,
      historyIndex,
    });
  },

  setProject: (project) => {
    const rootId = project.nodes[0]?.id ?? null;
    // Release rule #8: Do NOT auto-expand every depth-1 directory!
    // Start with a clean, unexploded overview with only root expanded.
    const initialExpanded = new Set<string>();
    if (rootId) {
      initialExpanded.add(rootId);
    }

    const initialHistory: HistoryEntry[] = rootId
      ? [{ nodeId: rootId, mapFocusNodeId: rootId, page: 'graph', previewFileId: null, mapMode: '2d' }]
      : [];

    set({
      project,
      page: 'graph',
      mapMode: '2d', // New/opened projects strictly default to 2D
      selectedNodeId: rootId,
      mapFocusNodeId: rootId,
      previewFileId: null,
      expandedNodeIds: initialExpanded,
      navigationHistory: initialHistory,
      historyIndex: initialHistory.length - 1,
    });
  },

  clearProject: () =>
    set({
      project: null,
      selectedNodeId: null,
      mapFocusNodeId: null,
      previewFileId: null,
      mapMode: '2d',
      expandedNodeIds: new Set(),
      isInspectorCollapsed: false,
      navigationHistory: [],
      historyIndex: -1,
      page: 'projects',
    }),

  setMapFocusNodeId: (mapFocusNodeId, recordHistory = true) => {
    const state = get();
    if (state.mapFocusNodeId === mapFocusNodeId) return;

    if (recordHistory) {
      const { navigationHistory, historyIndex } = pushHistoryEntry(
        state.navigationHistory,
        state.historyIndex,
        {
          nodeId: state.selectedNodeId,
          mapFocusNodeId,
          page: state.page,
          previewFileId: state.previewFileId,
          mapMode: state.mapMode,
        }
      );
      set({ mapFocusNodeId, navigationHistory, historyIndex });
    } else {
      set({ mapFocusNodeId });
    }
  },

  drillDownNode: (id) => {
    const state = get();
    const node = state.project?.nodes.find((n) => n.id === id);
    if (!node) return;

    if (node.kind === 'directory' || node.kind === 'project') {
      const nextExpanded = new Set(state.expandedNodeIds);
      nextExpanded.add(id);

      const { navigationHistory, historyIndex } = pushHistoryEntry(
        state.navigationHistory,
        state.historyIndex,
        {
          nodeId: id,
          mapFocusNodeId: id,
          page: state.page,
          previewFileId: state.previewFileId,
          mapMode: state.mapMode,
        }
      );

      set({
        mapFocusNodeId: id,
        selectedNodeId: id,
        expandedNodeIds: nextExpanded,
        navigationHistory,
        historyIndex,
      });
    } else {
      state.selectNode(id, true);
    }
  },

  navigateUpToParentFocus: () => {
    const state = get();
    if (!state.project || !state.mapFocusNodeId) return;
    const currentFocus = state.project.nodes.find((n) => n.id === state.mapFocusNodeId);
    if (currentFocus?.parentId) {
      const parentId = currentFocus.parentId;
      const { navigationHistory, historyIndex } = pushHistoryEntry(
        state.navigationHistory,
        state.historyIndex,
        {
          nodeId: parentId,
          mapFocusNodeId: parentId,
          page: state.page,
          previewFileId: state.previewFileId,
          mapMode: state.mapMode,
        }
      );

      set({
        mapFocusNodeId: parentId,
        selectedNodeId: parentId,
        navigationHistory,
        historyIndex,
      });
    }
  },

  revealNodeOnMap: (nodeId: string) => {
    const state = get();
    if (!state.project) return;
    const nodesById = new Map(state.project.nodes.map((n) => [n.id, n]));
    const node = nodesById.get(nodeId);
    if (!node) return;

    const rootId = state.project.nodes[0]?.id ?? null;
    const nextExpanded = new Set(state.expandedNodeIds);

    // Expand all ancestors leading to this node using O(1) Map lookups
    let curr = node.parentId ? nodesById.get(node.parentId) : undefined;
    while (curr) {
      nextExpanded.add(curr.id);
      curr = curr.parentId ? nodesById.get(curr.parentId) : undefined;
    }

    let targetFocusId: string;
    if (node.kind === 'project') {
      targetFocusId = node.id;
    } else if (node.kind === 'directory') {
      targetFocusId = node.id;
      nextExpanded.add(node.id);
    } else {
      // file: parent directory is the map focus
      targetFocusId = node.parentId ?? rootId ?? node.id;
      if (node.parentId) {
        nextExpanded.add(node.parentId);
      }
    }

    const { navigationHistory, historyIndex } = pushHistoryEntry(
      state.navigationHistory,
      state.historyIndex,
      {
        nodeId: node.id,
        mapFocusNodeId: targetFocusId,
        page: 'graph',
        previewFileId: null,
        mapMode: state.mapMode,
      }
    );

    set({
      selectedNodeId: node.id,
      mapFocusNodeId: targetFocusId,
      page: 'graph',
      previewFileId: null,
      expandedNodeIds: nextExpanded,
      navigationHistory,
      historyIndex,
    });
  },

  setInspectorCollapsed: (isInspectorCollapsed) => set({ isInspectorCollapsed }),

  toggleInspector: () => set((state) => ({ isInspectorCollapsed: !state.isInspectorCollapsed })),

  selectNode: (selectedNodeId, recordHistory = true) => {
    const state = get();
    if (state.selectedNodeId === selectedNodeId) return;

    if (recordHistory) {
      const { navigationHistory, historyIndex } = pushHistoryEntry(
        state.navigationHistory,
        state.historyIndex,
        {
          nodeId: selectedNodeId,
          mapFocusNodeId: state.mapFocusNodeId,
          page: state.page,
          previewFileId: state.previewFileId,
          mapMode: state.mapMode,
        }
      );

      set({
        selectedNodeId,
        navigationHistory,
        historyIndex,
      });
    } else {
      set({ selectedNodeId });
    }
  },

  setMapMode: (mapMode) => {
    const state = get();
    if (state.mapMode === mapMode) return;

    if (state.historyIndex >= 0 && state.navigationHistory[state.historyIndex]) {
      const updatedHistory = [...state.navigationHistory];
      updatedHistory[state.historyIndex] = {
        ...updatedHistory[state.historyIndex],
        mapMode,
      };
      set({ mapMode, navigationHistory: updatedHistory });
    } else {
      set({ mapMode });
    }
  },

  setRelationshipMode: (relationshipMode) => set({ relationshipMode }),

  toggleExpandNode: (id: string) => {
    set((state) => {
      const next = new Set(state.expandedNodeIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedNodeIds: next };
    });
  },

  expandNode: (id: string) => {
    set((state) => {
      if (state.expandedNodeIds.has(id)) return state;
      const next = new Set(state.expandedNodeIds);
      next.add(id);
      return { expandedNodeIds: next };
    });
  },

  collapseNode: (id: string) => {
    set((state) => {
      if (!state.expandedNodeIds.has(id)) return state;
      const next = new Set(state.expandedNodeIds);
      next.delete(id);
      return { expandedNodeIds: next };
    });
  },

  openFileViewer: (nodeId: string) => {
    const state = get();
    const node = state.project?.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== 'file') return;

    const { navigationHistory, historyIndex } = pushHistoryEntry(
      state.navigationHistory,
      state.historyIndex,
      {
        nodeId,
        mapFocusNodeId: state.mapFocusNodeId,
        page: state.page,
        previewFileId: nodeId,
        mapMode: state.mapMode,
      }
    );

    set({
      previewFileId: nodeId,
      selectedNodeId: nodeId,
      navigationHistory,
      historyIndex,
    });
  },

  closeFileViewer: () => {
    const state = get();
    if (!state.previewFileId) return;

    const { navigationHistory, historyIndex } = pushHistoryEntry(
      state.navigationHistory,
      state.historyIndex,
      {
        nodeId: state.selectedNodeId,
        mapFocusNodeId: state.mapFocusNodeId,
        page: state.page,
        previewFileId: null,
        mapMode: state.mapMode,
      }
    );

    set({
      previewFileId: null,
      navigationHistory,
      historyIndex,
    });
  },

  navigateBack: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const nextIndex = state.historyIndex - 1;
      const entry = state.navigationHistory[nextIndex];
      if (entry) {
        set({
          historyIndex: nextIndex,
          selectedNodeId: entry.nodeId,
          mapFocusNodeId: entry.mapFocusNodeId,
          page: entry.page,
          previewFileId: entry.previewFileId,
          mapMode: entry.mapMode,
        });
      }
    }
  },

  navigateForward: () => {
    const state = get();
    if (state.historyIndex < state.navigationHistory.length - 1) {
      const nextIndex = state.historyIndex + 1;
      const entry = state.navigationHistory[nextIndex];
      if (entry) {
        set({
          historyIndex: nextIndex,
          selectedNodeId: entry.nodeId,
          mapFocusNodeId: entry.mapFocusNodeId,
          page: entry.page,
          previewFileId: entry.previewFileId,
          mapMode: entry.mapMode,
        });
      }
    }
  },
}));

