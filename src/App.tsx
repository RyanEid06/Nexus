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

export default function App() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && useAppStore.getState().project) {
        event.preventDefault();
        useAppStore.getState().setPage('search');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const protectedPage = page !== 'projects' && page !== 'settings';
  const effectivePage = protectedPage && !project ? 'projects' : page;

  return <div className="app-shell"><Sidebar/>{effectivePage === 'projects' && <ProjectsPage/>}{effectivePage === 'graph' && project && <GraphPage/>}{effectivePage === 'structure' && project && <StructurePage/>}{effectivePage === 'analytics' && project && <AnalyticsPage/>}{effectivePage === 'dependencies' && project && <DependenciesPage/>}{effectivePage === 'search' && project && <SearchPage/>}{effectivePage === 'settings' && <SettingsPage/>}</div>;
}
