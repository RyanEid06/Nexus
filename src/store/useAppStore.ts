import { create } from 'zustand';
import type { AppPage, ProjectIndex } from '../domain/models';

interface AppState {
  page: AppPage;
  project: ProjectIndex | null;
  selectedNodeId: string | null;
  setPage: (page: AppPage) => void;
  setProject: (project: ProjectIndex) => void;
  clearProject: () => void;
  selectNode: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  page: 'projects',
  project: null,
  selectedNodeId: null,
  setPage: (page) => set({ page }),
  setProject: (project) => set({ project, page: 'graph', selectedNodeId: project.nodes[0]?.id ?? null }),
  clearProject: () => set({ project: null, selectedNodeId: null, page: 'projects' }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
}));
