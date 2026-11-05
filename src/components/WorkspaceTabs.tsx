import { Search } from 'lucide-react';
import type { AppPage } from '../domain/models';
import { useAppStore } from '../store/useAppStore';

const tabs: Array<[AppPage, string]> = [
  ['graph', 'Graph'],
  ['structure', 'Structure'],
  ['dependencies', 'Dependencies'],
  ['analytics', 'Analytics'],
];

export function WorkspaceTabs() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);
  const setPage = useAppStore((s) => s.setPage);
  if (!project) return null;

  return <header className="workspace-top">
    <div className="breadcrumbs">NEXUS <span>›</span> {project.name}</div>
    <div className="top-tabs">{tabs.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>)}</div>
    <button className="search-pill" onClick={() => setPage('search')}><Search size={15}/><span>Search files…</span><kbd>Ctrl K</kbd></button>
  </header>;
}
