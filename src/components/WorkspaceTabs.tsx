import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { SCANNER_ANALYSIS_VERSION, type AppPage } from '../domain/models';
import { useAppStore } from '../store/useAppStore';

const tabs: Array<[AppPage, string]> = [
  ['graph', 'Map'],
  ['structure', 'Structure'],
  ['dependencies', 'Dependencies'],
  ['analytics', 'Analytics'],
];

export function WorkspaceTabs() {
  const page = useAppStore((s) => s.page);
  const project = useAppStore((s) => s.project);
  const workspaceProjects = useAppStore((s) => s.workspaceProjects);
  const constellationMode = useAppStore((s) => s.constellationMode);
  const setPage = useAppStore((s) => s.setPage);
  const switchProject = useAppStore((s) => s.switchProject);
  const historyIndex = useAppStore((s) => s.historyIndex);
  const navigationHistory = useAppStore((s) => s.navigationHistory);
  const navigateBack = useAppStore((s) => s.navigateBack);
  const navigateForward = useAppStore((s) => s.navigateForward);

  if (!project) return null;

  const canBack = historyIndex > 0;
  const canForward = historyIndex < navigationHistory.length - 1;
  const isOutdated = (project.analysisConfig?.scannerAnalysisVersion ?? 0) < SCANNER_ANALYSIS_VERSION;

  return (
    <header className="workspace-top">
      <div className="nav-history-group">
        <button
          className="history-nav-btn"
          disabled={!canBack}
          onClick={navigateBack}
          title="Back in exploration history (Alt+Left)"
          aria-label="Back in exploration history"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          className="history-nav-btn"
          disabled={!canForward}
          onClick={navigateForward}
          title="Forward in exploration history (Alt+Right)"
          aria-label="Forward in exploration history"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="breadcrumbs">
        <span className="breadcrumb-brand">NEXUS</span>
        <span className="breadcrumb-sep">/</span>
        {workspaceProjects.length > 1 ? (
          <select
            className="project-switcher-select"
            value={project.id}
            onChange={(e) => switchProject(e.target.value)}
            aria-label="Active workspace project"
          >
            {workspaceProjects.map((wp) => (
              <option key={wp.id} value={wp.id}>
                {wp.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="breadcrumb-active-name">{project.name}</span>
        )}
        {constellationMode && page === 'graph' && (
          <span className="breadcrumb-constellation-tag">{workspaceProjects.length} repos</span>
        )}
        {isOutdated && (
          <span
            className="outdated-index-note"
            title="This project index was created with an older scanner version."
          >
            <AlertTriangle size={12} /> Stale cache
          </span>
        )}
      </div>

      <nav className="top-tabs" aria-label="Workspace Views">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={page === key ? 'active' : ''}
            onClick={() => setPage(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <button className="search-trigger" onClick={() => setPage('search')}>
        <Search size={14} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
    </header>
  );
}
