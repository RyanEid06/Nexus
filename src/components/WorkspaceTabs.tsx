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
  const setPage = useAppStore((s) => s.setPage);
  const historyIndex = useAppStore((s) => s.historyIndex);
  const navigationHistory = useAppStore((s) => s.navigationHistory);
  const navigateBack = useAppStore((s) => s.navigateBack);
  const navigateForward = useAppStore((s) => s.navigateForward);

  if (!project) return null;

  const canBack = historyIndex > 0;
  const canForward = historyIndex < navigationHistory.length - 1;

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
          <ChevronLeft size={16} />
        </button>
        <button
          className="history-nav-btn"
          disabled={!canForward}
          onClick={navigateForward}
          title="Forward in exploration history (Alt+Right)"
          aria-label="Forward in exploration history"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="breadcrumbs">
        NEXUS <span>›</span> {project.name}
        {(project.analysisConfig?.scannerAnalysisVersion ?? 0) < SCANNER_ANALYSIS_VERSION && (
          <span className="outdated-index-pill" title="This project index was created with an older version of NEXUS.">
            <AlertTriangle size={12} /> Viewing outdated cached index
          </span>
        )}
      </div>

      <div className="top-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
            {label}
          </button>
        ))}
      </div>

      <button className="search-pill" onClick={() => setPage('search')}>
        <Search size={15} />
        <span>Search files…</span>
        <kbd>Ctrl K</kbd>
      </button>
    </header>
  );
}

