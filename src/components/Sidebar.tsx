import { FileSearch, Folder, FolderKanban, Settings } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Brand } from './Brand';

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);
  const setPage = useAppStore((s) => s.setPage);
  const selectNode = useAppStore((s) => s.selectNode);
  const revealNodeOnMap = useAppStore((s) => s.revealNodeOnMap);

  const allTopFolders = project?.nodes.filter(
    (node) => node.parentId === project.nodes[0]?.id && node.kind === 'directory'
  ) ?? [];

  const visibleFolders = allTopFolders.slice(0, 8);
  const remainingCount = allTopFolders.length - visibleFolders.length;

  return (
    <aside className="sidebar">
      <Brand />
      <nav className="sidebar-primary">
        <button
          className={page === 'projects' ? 'active' : ''}
          onClick={() => setPage('projects')}
        >
          <FolderKanban size={17} />
          Projects
        </button>
      </nav>

      {project && (
        <section className="project-explorer" aria-label="Project Quick Folders">
          <button
            className="project-root-link"
            onClick={() => {
              if (project.nodes[0]) {
                revealNodeOnMap(project.nodes[0].id);
              }
            }}
          >
            <Folder size={15} />
            <span>{project.name}</span>
          </button>
          {visibleFolders.map((node) => (
            <button
              key={node.id}
              className="tree-link"
              onClick={() => {
                revealNodeOnMap(node.id);
              }}
            >
              <span className="tree-line" />
              <Folder size={14} />
              <span>{node.name}</span>
            </button>
          ))}
          {remainingCount > 0 && (
            <button
              className="tree-more-btn"
              onClick={() => setPage('structure')}
              title="View all folders in Structure Explorer"
            >
              +{remainingCount} more · View Structure
            </button>
          )}
        </section>
      )}

      <nav className="sidebar-secondary">
        <button
          className={page === 'search' ? 'active' : ''}
          disabled={!project}
          onClick={() => setPage('search')}
        >
          <FileSearch size={17} />
          Search
        </button>
        <button
          className={page === 'settings' ? 'active' : ''}
          onClick={() => setPage('settings')}
        >
          <Settings size={17} />
          Settings
        </button>
      </nav>

      <div className="local-status">
        <span className="dot" />
        Local source
        <small>Project contents are not uploaded</small>
      </div>
    </aside>
  );
}

