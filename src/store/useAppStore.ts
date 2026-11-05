import { create } from 'zustand';
import type { AppPage, ProjectIndex } from '../domain/models';

export type MapMode = '2d' | '3d';
export type RelationshipFilterMode = 'hierarchy' | 'dependencies' | 'both';

export interface HistoryEntry {
  nodeId: string;
  page?: AppPage;
}

interface AppState {
  page: AppPage;
  project: ProjectIndex | null;
  selectedNodeId: string | null;
  mapMode: MapMode;
  relationshipMode: RelationshipFilterMode;
  expandedNodeIds: Set<string>;
  previewFileId: string | null;
  navigationHistory: HistoryEntry[];
  historyIndex: number;

  setPage: (page: AppPage) => void;
  setProject: (project: ProjectIndex) => void;
  clearProject: () => void;
  selectNode: (id: string | null, recordHistory?: boolean) => void;
  setMapMode: (mode: MapMode) => void;
  setRelationshipMode: (mode: RelationshipFilterMode) => void;
  toggleExpandNode: (id: string) => void;
  expandNode: (id: string) => void;
  collapseNode: (id: string) => void;
  openFileViewer: (nodeId: string) => void;
  closeFileViewer: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
}

const MAX_HISTORY = 50;

export const useAppStore = create<AppState>((set, get) => ({
  page: 'projects',
  project: null,
  selectedNodeId: null,
  mapMode: '2d',
  relationshipMode: 'hierarchy',
  expandedNodeIds: new Set<string>(),
  previewFileId: null,
  navigationHistory: [],
  historyIndex: -1,

  setPage: (page) => set({ page }),

  setProject: (project) => {
    const rootId = project.nodes[0]?.id ?? null;
    // By default, top-level directories start expanded for quick exploration
    const initialExpanded = new Set<string>();
    if (rootId) {
      initialExpanded.add(rootId);
      for (const node of project.nodes) {
        if (node.depth === 1 && node.kind === 'directory') {
          initialExpanded.add(node.id);
        }
      }
    }

    const initialHistory = rootId ? [{ nodeId: rootId, page: 'graph' as AppPage }] : [];

    set({
      project,
      page: 'graph',
      selectedNodeId: rootId,
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
      previewFileId: null,
      expandedNodeIds: new Set(),
      navigationHistory: [],
      historyIndex: -1,
      page: 'projects',
    }),

  selectNode: (selectedNodeId, recordHistory = true) => {
    const state = get();
    if (!selectedNodeId) {
      set({ selectedNodeId: null });
      return;
    }

    if (state.selectedNodeId === selectedNodeId) return;

    if (recordHistory) {
      const currentHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
      const lastEntry = currentHistory[currentHistory.length - 1];

      let newHistory = currentHistory;
      if (!lastEntry || lastEntry.nodeId !== selectedNodeId) {
        newHistory = [...currentHistory, { nodeId: selectedNodeId, page: state.page }].slice(-MAX_HISTORY);
      }

      set({
        selectedNodeId,
        navigationHistory: newHistory,
        historyIndex: newHistory.length - 1,
      });
    } else {
      set({ selectedNodeId });
    }
  },

  setMapMode: (mapMode) => set({ mapMode }),

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

    // Record history
    const currentHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
    const lastEntry = currentHistory[currentHistory.length - 1];
    let newHistory = currentHistory;
    if (!lastEntry || lastEntry.nodeId !== nodeId) {
      newHistory = [...currentHistory, { nodeId, page: state.page }].slice(-MAX_HISTORY);
    }

    set({
      previewFileId: nodeId,
      selectedNodeId: nodeId,
      navigationHistory: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  closeFileViewer: () => set({ previewFileId: null }),

  navigateBack: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const nextIndex = state.historyIndex - 1;
      const entry = state.navigationHistory[nextIndex];
      if (entry) {
        set({
          historyIndex: nextIndex,
          selectedNodeId: entry.nodeId,
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
        });
      }
    }
  },
}));

