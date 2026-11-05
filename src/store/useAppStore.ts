import { create } from 'zustand';
import type { AppPage, ProjectIndex } from '../domain/models';

export type MapMode = '2d' | '3d';
export type RelationshipFilterMode = 'hierarchy' | 'dependencies' | 'both';

export interface HistoryEntry {
  nodeId: string | null;
  page: AppPage;
  previewFileId: string | null;
  mapMode?: MapMode;
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

  setPage: (page) => {
    const state = get();
    if (state.page === page) return;

    const currentHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
    const lastEntry = currentHistory[currentHistory.length - 1];

    let newHistory = currentHistory;
    if (
      !lastEntry ||
      lastEntry.page !== page ||
      lastEntry.nodeId !== state.selectedNodeId ||
      lastEntry.previewFileId !== state.previewFileId
    ) {
      newHistory = [
        ...currentHistory,
        {
          nodeId: state.selectedNodeId,
          page,
          previewFileId: state.previewFileId,
          mapMode: state.mapMode,
        },
      ].slice(-MAX_HISTORY);
    }

    set({
      page,
      navigationHistory: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

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

    const initialHistory: HistoryEntry[] = rootId
      ? [{ nodeId: rootId, page: 'graph', previewFileId: null, mapMode: '2d' }]
      : [];

    set({
      project,
      page: 'graph',
      mapMode: '2d', // GEMINI.md Section 10: New/opened projects strictly default to 2D
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
      mapMode: '2d',
      expandedNodeIds: new Set(),
      navigationHistory: [],
      historyIndex: -1,
      page: 'projects',
    }),

  selectNode: (selectedNodeId, recordHistory = true) => {
    const state = get();
    if (state.selectedNodeId === selectedNodeId) return;

    if (recordHistory) {
      const currentHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
      const lastEntry = currentHistory[currentHistory.length - 1];

      let newHistory = currentHistory;
      if (
        !lastEntry ||
        lastEntry.nodeId !== selectedNodeId ||
        lastEntry.page !== state.page ||
        lastEntry.previewFileId !== state.previewFileId
      ) {
        newHistory = [
          ...currentHistory,
          {
            nodeId: selectedNodeId,
            page: state.page,
            previewFileId: state.previewFileId,
            mapMode: state.mapMode,
          },
        ].slice(-MAX_HISTORY);
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

    const currentHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
    const lastEntry = currentHistory[currentHistory.length - 1];
    let newHistory = currentHistory;
    if (
      !lastEntry ||
      lastEntry.nodeId !== nodeId ||
      lastEntry.previewFileId !== nodeId ||
      lastEntry.page !== state.page
    ) {
      newHistory = [
        ...currentHistory,
        {
          nodeId,
          page: state.page,
          previewFileId: nodeId,
          mapMode: state.mapMode,
        },
      ].slice(-MAX_HISTORY);
    }

    set({
      previewFileId: nodeId,
      selectedNodeId: nodeId,
      navigationHistory: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  closeFileViewer: () => {
    const state = get();
    if (!state.previewFileId) return;

    const currentHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
    const newHistory = [
      ...currentHistory,
      {
        nodeId: state.selectedNodeId,
        page: state.page,
        previewFileId: null,
        mapMode: state.mapMode,
      },
    ].slice(-MAX_HISTORY);

    set({
      previewFileId: null,
      navigationHistory: newHistory,
      historyIndex: newHistory.length - 1,
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
          page: entry.page,
          previewFileId: entry.previewFileId,
          ...(entry.mapMode ? { mapMode: entry.mapMode } : {}),
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
          page: entry.page,
          previewFileId: entry.previewFileId,
          ...(entry.mapMode ? { mapMode: entry.mapMode } : {}),
        });
      }
    }
  },
}));

