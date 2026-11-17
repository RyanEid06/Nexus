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
  projectId?: string;
  constellationMode?: boolean;
  mapPageOffset?: number;
}

interface AppState {
  page: AppPage;
  project: ProjectIndex | null;
  workspaceProjects: ProjectIndex[];
  constellationProjectIds: string[];
  constellationMode: boolean;
  selectedNodeId: string | null;
  mapFocusNodeId: string | null;
  mapPageOffset: number;
  mapMode: MapMode;
  relationshipMode: RelationshipFilterMode;
  expandedNodeIds: Set<string>;
  previewFileId: string | null;
  isInspectorCollapsed: boolean;
  navigationHistory: HistoryEntry[];
  historyIndex: number;

  setPage: (page: AppPage) => void;
  setProject: (project: ProjectIndex) => void;
  addWorkspaceProject: (project: ProjectIndex) => void;
  switchProject: (projectId: string, targetPage?: AppPage) => void;
  removeWorkspaceProject: (projectId: string) => void;
  setConstellationMode: (enabled: boolean) => void;
  toggleConstellationProject: (projectId: string) => void;
  launchConstellation: (projects: ProjectIndex[], activeProjectId?: string) => void;
  clearProject: () => void;
  selectNode: (id: string | null, recordHistory?: boolean) => void;
  setMapFocusNodeId: (id: string | null, recordHistory?: boolean) => void;
  setMapPageOffset: (offset: number) => void;
  nextMapPage: () => void;
  prevMapPage: () => void;
  previewFolderBranch: (id: string) => void;
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
const MAX_WORKSPACE_PROJECTS = 6;
const MAP_PAGE_SIZE = 24;

function getRootNodeId(project: ProjectIndex): string | null {
  return (project.nodes.find((n) => n.kind === 'project') ?? project.nodes[0])?.id ?? null;
}

function upsertWorkspaceProject(list: ProjectIndex[], incoming: ProjectIndex): ProjectIndex[] {
  const existingIdx = list.findIndex((p) => p.id === incoming.id);
  if (existingIdx >= 0) {
    const next = [...list];
    next[existingIdx] = incoming;
    return next;
  }
  return [...list, incoming].slice(-MAX_WORKSPACE_PROJECTS);
}

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
    lastEntry.mapMode === newEntry.mapMode &&
    lastEntry.projectId === newEntry.projectId &&
    Boolean(lastEntry.constellationMode) === Boolean(newEntry.constellationMode) &&
    (lastEntry.mapPageOffset ?? 0) === (newEntry.mapPageOffset ?? 0)
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
  workspaceProjects: [],
  constellationProjectIds: [],
  constellationMode: false,
  selectedNodeId: null,
  mapFocusNodeId: null,
  mapPageOffset: 0,
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
        projectId: state.project?.id,
        constellationMode: state.constellationMode,
      }
    );

    set({
      page,
      navigationHistory,
      historyIndex,
    });
  },

  setProject: (project) => {
    const state = get();
    const rootId = getRootNodeId(project);
    // Start with a clean, unexploded overview with only root expanded.
    const initialExpanded = new Set<string>();
    if (rootId) {
      initialExpanded.add(rootId);
    }

    const nextWorkspace = upsertWorkspaceProject(state.workspaceProjects, project);
    const nextConstellationIds = state.constellationProjectIds.includes(project.id)
      ? state.constellationProjectIds
      : [...state.constellationProjectIds, project.id].slice(-MAX_WORKSPACE_PROJECTS);

    const initialHistory: HistoryEntry[] = rootId
      ? [
          {
            nodeId: rootId,
            mapFocusNodeId: rootId,
            page: 'graph',
            previewFileId: null,
            mapMode: '2d',
            projectId: project.id,
            constellationMode: false,
          },
        ]
      : [];

    set({
      project,
      workspaceProjects: nextWorkspace,
      constellationProjectIds: nextConstellationIds,
      constellationMode: false,
      page: 'graph',
      mapMode: '2d', // New/opened projects strictly default to 2D
      relationshipMode: 'hierarchy',
      selectedNodeId: rootId,
      mapFocusNodeId: rootId,
      mapPageOffset: 0,
      previewFileId: null,
      expandedNodeIds: initialExpanded,
      navigationHistory: initialHistory,
      historyIndex: initialHistory.length - 1,
    });
  },

  addWorkspaceProject: (project) => {
    set((state) => {
      const nextWorkspace = upsertWorkspaceProject(state.workspaceProjects, project);
      const nextConstellationIds = state.constellationProjectIds.includes(project.id)
        ? state.constellationProjectIds
        : [...state.constellationProjectIds, project.id].slice(-MAX_WORKSPACE_PROJECTS);
      return {
        workspaceProjects: nextWorkspace,
        constellationProjectIds: nextConstellationIds,
      };
    });
  },

  switchProject: (projectId, targetPage) => {
    const state = get();
    const target = state.workspaceProjects.find((p) => p.id === projectId);
    if (!target) return;

    const rootId = getRootNodeId(target);
    const nextExpanded = new Set<string>();
    if (rootId) nextExpanded.add(rootId);

    const resolvedPage = targetPage ?? (state.page === 'projects' || state.page === 'settings' ? 'graph' : state.page);

    const { navigationHistory, historyIndex } = pushHistoryEntry(
      state.navigationHistory,
      state.historyIndex,
      {
        nodeId: rootId,
        mapFocusNodeId: rootId,
        page: resolvedPage,
        previewFileId: null,
        mapMode: state.mapMode,
        projectId: target.id,
        constellationMode: false,
        mapPageOffset: 0,
      }
    );

    set({
      project: target,
      constellationMode: false,
      page: resolvedPage,
      selectedNodeId: rootId,
      mapFocusNodeId: rootId,
      mapPageOffset: 0,
      previewFileId: null,
      expandedNodeIds: nextExpanded,
      navigationHistory,
      historyIndex,
    });
  },

  removeWorkspaceProject: (projectId) => {
    set((state) => {
      const nextWorkspace = state.workspaceProjects.filter((p) => p.id !== projectId);
      const nextConstellationIds = state.constellationProjectIds.filter((id) => id !== projectId);
      if (state.project?.id === projectId) {
        const fallback = nextWorkspace[0] ?? null;
        if (!fallback) {
          return {
            project: null,
            workspaceProjects: [],
            constellationProjectIds: [],
            constellationMode: false,
            selectedNodeId: null,
            mapFocusNodeId: null,
            mapPageOffset: 0,
            previewFileId: null,
            expandedNodeIds: new Set(),
            page: 'projects',
          };
        }
        const rootId = getRootNodeId(fallback);
        return {
          project: fallback,
          workspaceProjects: nextWorkspace,
          constellationProjectIds: nextConstellationIds,
          constellationMode: nextConstellationIds.length >= 2 ? state.constellationMode : false,
          selectedNodeId: rootId,
          mapFocusNodeId: rootId,
          mapPageOffset: 0,
          previewFileId: null,
          expandedNodeIds: new Set(rootId ? [rootId] : []),
        };
      }
      return {
        workspaceProjects: nextWorkspace,
        constellationProjectIds: nextConstellationIds,
        constellationMode: nextConstellationIds.length >= 2 ? state.constellationMode : false,
      };
    });
  },

  setConstellationMode: (enabled) => {
    const state = get();
    if (enabled && state.workspaceProjects.length < 2) return;
    if (state.constellationMode === enabled) return;

    const nextIds =
      enabled && state.constellationProjectIds.length < 2
        ? state.workspaceProjects.map((p) => p.id)
        : state.constellationProjectIds;

    const { navigationHistory, historyIndex } = pushHistoryEntry(
      state.navigationHistory,
      state.historyIndex,
      {
        nodeId: state.selectedNodeId,
        mapFocusNodeId: state.mapFocusNodeId,
        page: 'graph',
        previewFileId: null,
        mapMode: state.mapMode,
        projectId: state.project?.id,
        constellationMode: enabled,
      }
    );

    set({
      constellationMode: enabled,
      constellationProjectIds: nextIds,
      page: 'graph',
      previewFileId: null,
      navigationHistory,
      historyIndex,
    });
  },

  toggleConstellationProject: (projectId) => {
    set((state) => {
      const exists = state.constellationProjectIds.includes(projectId);
      if (exists && state.constellationProjectIds.length <= 2 && state.constellationMode) {
        return state; // Keep at least 2 projects when actively viewing constellation
      }
      const next = exists
        ? state.constellationProjectIds.filter((id) => id !== projectId)
        : [...state.constellationProjectIds, projectId].slice(-MAX_WORKSPACE_PROJECTS);
      return { constellationProjectIds: next };
    });
  },

  launchConstellation: (projects, activeProjectId) => {
    if (projects.length === 0) return;
    const active = (activeProjectId ? projects.find((p) => p.id === activeProjectId) : null) ?? projects[0];
    const rootId = getRootNodeId(active);
    const initialExpanded = new Set<string>(rootId ? [rootId] : []);

    let mergedWorkspace = get().workspaceProjects;
    for (const p of projects) {
      mergedWorkspace = upsertWorkspaceProject(mergedWorkspace, p);
    }

    const constellationIds = projects.map((p) => p.id).slice(0, MAX_WORKSPACE_PROJECTS);
    const isMulti = constellationIds.length >= 2;

    const entry: HistoryEntry = {
      nodeId: rootId,
      mapFocusNodeId: rootId,
      page: 'graph',
      previewFileId: null,
      mapMode: get().mapMode,
      projectId: active.id,
      constellationMode: isMulti,
    };

    set({
      project: active,
      workspaceProjects: mergedWorkspace,
      constellationProjectIds: constellationIds,
      constellationMode: isMulti,
      page: 'graph',
      selectedNodeId: rootId,
      mapFocusNodeId: rootId,
      mapPageOffset: 0,
      previewFileId: null,
      expandedNodeIds: initialExpanded,
      navigationHistory: [entry],
      historyIndex: 0,
    });
  },

  clearProject: () =>
    set({
      project: null,
      workspaceProjects: [],
      constellationProjectIds: [],
      constellationMode: false,
      selectedNodeId: null,
      mapFocusNodeId: null,
      mapPageOffset: 0,
      previewFileId: null,
      mapMode: '2d',
      relationshipMode: 'hierarchy',
      expandedNodeIds: new Set(),
      isInspectorCollapsed: false,
      navigationHistory: [],
      historyIndex: -1,
      page: 'projects',
    }),

  setMapFocusNodeId: (mapFocusNodeId, recordHistory = true) => {
    const state = get();
    if (state.mapFocusNodeId === mapFocusNodeId && state.mapPageOffset === 0) return;

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
          projectId: state.project?.id,
          constellationMode: state.constellationMode,
          mapPageOffset: 0,
        }
      );
      set({ mapFocusNodeId, mapPageOffset: 0, navigationHistory, historyIndex });
    } else {
      set({ mapFocusNodeId, mapPageOffset: 0 });
    }
  },

  setMapPageOffset: (offset) => {
    const state = get();
    if (!state.project) return;
    const focusId = state.mapFocusNodeId ?? getRootNodeId(state.project);
    const totalDirect = focusId ? state.project.nodes.filter((n) => n.parentId === focusId).length : 0;
    const maxOffset = Math.max(0, Math.floor(Math.max(0, totalDirect - 1) / MAP_PAGE_SIZE) * MAP_PAGE_SIZE);
    const snapped = Math.max(0, Math.min(Math.floor(offset / MAP_PAGE_SIZE) * MAP_PAGE_SIZE, maxOffset));
    if (snapped === state.mapPageOffset) return;
    set({ mapPageOffset: snapped });
  },

  nextMapPage: () => {
    const state = get();
    if (!state.project) return;
    const focusId = state.mapFocusNodeId ?? getRootNodeId(state.project);
    const totalDirect = focusId ? state.project.nodes.filter((n) => n.parentId === focusId).length : 0;
    const nextOffset = state.mapPageOffset + MAP_PAGE_SIZE;
    if (nextOffset >= totalDirect) {
      set({ mapPageOffset: 0 });
    } else {
      set({ mapPageOffset: nextOffset });
    }
  },

  prevMapPage: () => {
    const state = get();
    if (!state.project) return;
    const prevOffset = Math.max(0, state.mapPageOffset - MAP_PAGE_SIZE);
    if (prevOffset !== state.mapPageOffset) {
      set({ mapPageOffset: prevOffset });
    }
  },

  previewFolderBranch: (id: string) => {
    const state = get();
    if (!state.project) return;
    const focusId = state.mapFocusNodeId ?? getRootNodeId(state.project);
    const byId = new Map(state.project.nodes.map((n) => [n.id, n]));
    const target = byId.get(id);
    if (!target || target.kind !== 'directory') return;

    // Preserve focus node and ancestors; expand ONLY this clicked folder branch for clean preview
    const nextExpanded = new Set<string>();
    let curr: typeof target | undefined = focusId ? byId.get(focusId) : undefined;
    while (curr) {
      nextExpanded.add(curr.id);
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }
    if (id !== focusId) {
      nextExpanded.add(id);
    }

    set({ expandedNodeIds: nextExpanded });
  },

  drillDownNode: (id) => {
    const state = get();
    const node = state.project?.nodes.find((n) => n.id === id);
    if (!node) return;

    if (node.kind === 'directory' || node.kind === 'project') {
      const nextExpanded = new Set<string>();
      const byId = new Map(state.project!.nodes.map((n) => [n.id, n]));
      let curr: typeof node | undefined = node;
      while (curr) {
        nextExpanded.add(curr.id);
        curr = curr.parentId ? byId.get(curr.parentId) : undefined;
      }

      const { navigationHistory, historyIndex } = pushHistoryEntry(
        state.navigationHistory,
        state.historyIndex,
        {
          nodeId: id,
          mapFocusNodeId: id,
          page: state.page,
          previewFileId: state.previewFileId,
          mapMode: state.mapMode,
          projectId: state.project?.id,
          constellationMode: false,
          mapPageOffset: 0,
        }
      );

      set({
        constellationMode: false,
        mapFocusNodeId: id,
        mapPageOffset: 0,
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
          projectId: state.project?.id,
          constellationMode: state.constellationMode,
          mapPageOffset: 0,
        }
      );

      set({
        mapFocusNodeId: parentId,
        mapPageOffset: 0,
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

    const rootId = getRootNodeId(state.project);
    const nextExpanded = new Set(state.expandedNodeIds);

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
        projectId: state.project?.id,
        constellationMode: false,
        mapPageOffset: 0,
      }
    );

    set({
      constellationMode: false,
      selectedNodeId: node.id,
      mapFocusNodeId: targetFocusId,
      mapPageOffset: 0,
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
          projectId: state.project?.id,
          constellationMode: state.constellationMode,
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
        projectId: state.project?.id,
        constellationMode: state.constellationMode,
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
        projectId: state.project?.id,
        constellationMode: state.constellationMode,
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
        const restoredProject = entry.projectId
          ? state.workspaceProjects.find((p) => p.id === entry.projectId) ?? state.project
          : state.project;
        set({
          historyIndex: nextIndex,
          project: restoredProject,
          selectedNodeId: entry.nodeId,
          mapFocusNodeId: entry.mapFocusNodeId,
          mapPageOffset: entry.mapPageOffset ?? 0,
          page: entry.page,
          previewFileId: entry.previewFileId,
          mapMode: entry.mapMode,
          constellationMode: Boolean(entry.constellationMode),
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
        const restoredProject = entry.projectId
          ? state.workspaceProjects.find((p) => p.id === entry.projectId) ?? state.project
          : state.project;
        set({
          historyIndex: nextIndex,
          project: restoredProject,
          selectedNodeId: entry.nodeId,
          mapFocusNodeId: entry.mapFocusNodeId,
          mapPageOffset: entry.mapPageOffset ?? 0,
          page: entry.page,
          previewFileId: entry.previewFileId,
          mapMode: entry.mapMode,
          constellationMode: Boolean(entry.constellationMode),
        });
      }
    }
  },
}));
