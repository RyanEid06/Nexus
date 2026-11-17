import { Boxes, FileSearch, Folder, FolderKanban, Layers, Settings, ShieldCheck, X } from 'lucide-react';
import { CURATED_SAMPLE_PROJECTS } from '../data/sampleProjects';
import { useAppStore } from '../store/useAppStore';
import { Brand } from './Brand';

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);
  const workspaceProjects = useAppStore((s) => s.workspaceProjects);
  const constellationMode = useAppStore((s) => s.constellationMode);
  const setPage = useAppStore((s) => s.setPage);
  const switchProject = useAppStore((s) => s.switchProject);
  const removeWorkspaceProject = useAppStore((s) => s.removeWorkspaceProject);
  const setConstellationMode = useAppStore((s) => s.setConstellationMode);
  const launchConstellation = useAppStore((s) => s.launchConstellation);
  const revealNodeOnMap = useAppStore((s) => s.revealNodeOnMap);

  const allTopFolders =
    project?.nodes.filter(
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
          <FolderKanban size={16} />
          <span>Projects</span>
        </button>
        {workspaceProjects.length >= 2 ? (
          <button
            className={page === 'graph' && constellationMode ? 'active' : ''}
            onClick={() => setConstellationMode(!constellationMode)}
            title="Visualize all workspace projects together in 2D or 3D"
          >
            <Boxes size={16} />
            <span>Constellation ({workspaceProjects.length})</span>
          </button>
        ) : (
          <button
            onClick={() =>
              launchConstellation(
                workspaceProjects.length === 1 && !CURATED_SAMPLE_PROJECTS.some((p) => p.id === workspaceProjects[0].id)
                  ? [workspaceProjects[0], CURATED_SAMPLE_PROJECTS[0], CURATED_SAMPLE_PROJECTS[1]]
                  : CURATED_SAMPLE_PROJECTS,
                project?.id
              )
            }
            title="Compare multiple architectures side-by-side in 2D and 3D"
          >
            <Boxes size={16} />
            <span>Multi-Project View</span>
          </button>
        )}
      </nav>

      {workspaceProjects.length > 0 && (
        <section className="sidebar-section" aria-label="Open Workspace Projects">
          <div className="sidebar-section-label">Workspace ({workspaceProjects.length})</div>
          <div className="workspace-project-list">
            {workspaceProjects.map((wp) => {
              const isCurrent = wp.id === project?.id && !constellationMode;
              return (
                <div key={wp.id} className={`workspace-project-row ${isCurrent ? 'active' : ''}`}>
                  <button
                    className="workspace-project-btn"
                    onClick={() => switchProject(wp.id)}
                    title={`Switch to ${wp.name} (${wp.metrics.files} files)`}
                  >
                    <Layers size={13} />
                    <span className="truncate">{wp.name}</span>
                  </button>
                  {workspaceProjects.length > 1 && (
                    <button
                      className="workspace-project-close"
                      onClick={() => removeWorkspaceProject(wp.id)}
                      title={`Close ${wp.name} from workspace`}
                      aria-label={`Close ${wp.name}`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {project && (
        <section className="project-explorer" aria-label="Project Quick Folders">
          <div className="sidebar-section-label">Subsystems</div>
          <button
            className="project-root-link"
            onClick={() => {
              if (project.nodes[0]) {
                revealNodeOnMap(project.nodes[0].id);
              }
            }}
          >
            <Folder size={14} />
            <span className="truncate">{project.name}</span>
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
              <Folder size={13} />
              <span className="truncate">{node.name}</span>
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
          <FileSearch size={16} />
          <span>Search</span>
        </button>
        <button
          className={page === 'settings' ? 'active' : ''}
          onClick={() => setPage('settings')}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </nav>

      <div className="local-status">
        <div className="local-status-title">
          <ShieldCheck size={14} />
          <span>Local-First Analysis</span>
        </div>
        <small>Source contents stay on this machine</small>
      </div>
    </aside>
  );
}
