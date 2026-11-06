import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProjectsPage } from './components/ProjectsPage';
import { GraphPage } from './components/GraphPage';
import { StructurePage } from './components/StructurePage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { DependenciesPage } from './components/DependenciesPage';
import { SearchPage } from './components/SearchPage';
import { SettingsPage } from './components/SettingsPage';
import { useAppStore } from './store/useAppStore';

if (typeof window !== 'undefined') {
  (window as unknown as { useAppStore: typeof useAppStore }).useAppStore = useAppStore;
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && useAppStore.getState().project) {
        event.preventDefault();
        useAppStore.getState().setPage('search');
      } else if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        useAppStore.getState().navigateBack();
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        useAppStore.getState().navigateForward();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);


  const protectedPage = page !== 'projects' && page !== 'settings';
  const effectivePage = protectedPage && !project ? 'projects' : page;

  return <div className="app-shell"><Sidebar/>{effectivePage === 'projects' && <ProjectsPage/>}{effectivePage === 'graph' && project && <GraphPage/>}{effectivePage === 'structure' && project && <StructurePage/>}{effectivePage === 'analytics' && project && <AnalyticsPage/>}{effectivePage === 'dependencies' && project && <DependenciesPage/>}{effectivePage === 'search' && project && <SearchPage/>}{effectivePage === 'settings' && <SettingsPage/>}</div>;
}
