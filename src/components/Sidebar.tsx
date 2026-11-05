import { BarChart3, FileSearch, Folder, FolderKanban, Settings } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Brand } from './Brand';

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);
  const setPage = useAppStore((s) => s.setPage);
  const selectNode = useAppStore((s) => s.selectNode);
  const topFolders = project?.nodes.filter((node) => node.parentId === project.nodes[0]?.id && node.kind === 'directory').slice(0, 12) ?? [];

  return <aside className="sidebar">
    <Brand />
    <nav className="sidebar-primary"><button className={page === 'projects' ? 'active' : ''} onClick={() => setPage('projects')}><FolderKanban size={17}/>Projects</button></nav>
    {project && <section className="project-explorer"><button className="project-root-link" onClick={() => { selectNode(project.nodes[0]?.id ?? null); setPage('graph'); }}><Folder size={15}/><span>{project.name}</span></button>{topFolders.map((node) => <button key={node.id} className="tree-link" onClick={() => { selectNode(node.id); setPage('graph'); }}><span className="tree-line"/><Folder size={14}/><span>{node.name}</span></button>)}</section>}
    <nav className="sidebar-secondary">
      <button className={page === 'search' ? 'active' : ''} disabled={!project} onClick={() => setPage('search')}><FileSearch size={17}/>Search</button>
      <button className={page === 'analytics' ? 'active' : ''} disabled={!project} onClick={() => setPage('analytics')}><BarChart3 size={17}/>Analytics</button>
      <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings size={17}/>Settings</button>
    </nav>
    <div className="local-status"><span className="dot" />Local source<small>Project contents are not uploaded</small></div>
  </aside>;
}
