import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Box, CheckCircle2, FolderOpen, AlertTriangle, Plus, RefreshCw, Trash2, Unplug } from 'lucide-react';
import { SCANNER_ANALYSIS_VERSION, type ProjectIndex } from '../domain/models';
import { demoProject } from '../data/demoProject';
import {
  getProjectHandle,
  getProjectHandleStatus,
  type HandleConnectionStatus,
  listProjects,
  loadProject,
  removeProject,
  requestProjectPermission,
  saveProject,
  validateRelocationCandidate,
} from '../storage/db';
import { pickLocalProjectDirectory, scanDirectoryHandle, supportsLocalDirectoryPicker } from '../services/projectScanner';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';
import { ImportProject } from './ImportProject';

type ProjectCard = Omit<ProjectIndex, 'nodes'>;

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export function ProjectsPage() {
  const [importing, setImporting] = useState(false);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [statuses, setStatuses] = useState<Record<string, HandleConnectionStatus>>({});
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [stalePromptId, setStalePromptId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const setProject = useAppStore((s) => s.setProject);
  const currentProject = useAppStore((s) => s.project);
  const browserSupported = supportsLocalDirectoryPicker();

  const refreshList = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);
      setLoadError('');

      // Query connection statuses concurrently
      const statusMap: Record<string, HandleConnectionStatus> = {};
      await Promise.all(
        list.map(async (p) => {
          statusMap[p.id] = await getProjectHandleStatus(p.id);
        })
      );
      setStatuses(statusMap);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Local project indexes could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function openProject(id: string, forceCached = false) {
    try {
      setLoadError('');
      const project = await loadProject(id);
      if (!project) return;

      const isStale = (project.analysisConfig?.scannerAnalysisVersion ?? 0) < SCANNER_ANALYSIS_VERSION;
      const status = statuses[id] ?? 'unavailable';

      if (isStale && !forceCached) {
        if (status === 'connected' || status === 'permission-required') {
          setStalePromptId(id);
          return;
        }
      }

      setProject(project);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to open project.');
    }
  }

  async function handleRefreshOrReconnect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const status = statuses[id];
    setRefreshingId(id);
    setLoadError('');

    try {
      if (status === 'permission-required') {
        const perm = await requestProjectPermission(id);
        if (perm !== 'granted') {
          setLoadError('Filesystem read permission was not granted.');
          return;
        }
      }

      const handle = await getProjectHandle(id);
      if (!handle) {
        setLoadError('Folder handle is no longer accessible. Use "Relocate Folder" to re-link.');
        return;
      }

      const prevProject = await loadProject(id);
      const updated = await scanDirectoryHandle(handle, { previousProject: prevProject });
      await saveProject(updated, handle);

      if (currentProject?.id === id) {
        setProject(updated);
      }
      await refreshList();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to refresh project.');
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleRelocateFolder(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!browserSupported) return;
    setRefreshingId(id);
    setLoadError('');

    try {
      const prevProject = await loadProject(id);
      if (!prevProject) {
        setLoadError('Cannot relocate: project index not found.');
        return;
      }

      const newHandle = await pickLocalProjectDirectory();
      // Safely inspect candidate handle before mutating database
      await validateRelocationCandidate(prevProject, newHandle);

      // Perform scan with previous project data for continuity
      const updated = await scanDirectoryHandle(newHandle, { previousProject: prevProject });

      // Only save project and attach handle after successful validation and scan!
      await saveProject(updated, newHandle);

      if (currentProject?.id === id) {
        setProject(updated);
      }
      await refreshList();
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setLoadError(err instanceof Error ? err.message : 'Failed to relocate folder.');
      }
    } finally {
      setRefreshingId(null);
    }
  }

  async function confirmRemove(id: string) {
    try {
      setLoadError('');
      await removeProject(id);
      setDeleteConfirmId(null);
      await refreshList();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to remove project.');
    }
  }

  return (
    <main className="page projects-page">
      <header className="hero">
        <img src="/nexus-mark.svg" alt="NEXUS" />
        <h1>NEXUS</h1>
        <p>Visualize. Explore. Understand your code.</p>
        <small>
          Turn a local software project into an interactive architectural map. Direct local-first access, client-only analysis, and zero cloud uploads.
        </small>
        <div>
          <button
            className="primary"
            onClick={() => setImporting(true)}
            disabled={!browserSupported}
            title={browserSupported ? 'Select a local directory' : 'Requires a supported Chromium desktop browser'}
          >
            <FolderOpen size={17} />
            Open Local Project
          </button>
          <button className="ghost" onClick={() => setProject(demoProject)}>
            Open Curated Demo
          </button>
        </div>
      </header>

      {!browserSupported && (
        <div className="browser-banner" role="alert">
          <AlertCircle size={18} />
          <div>
            <b>Local Directory Access Unavailable in this Browser</b>
            <p>
              Direct folder opening via the File System Access API requires a supported desktop Chromium browser (Google Chrome, Microsoft Edge, Brave, Opera). You can still explore the preloaded Curated Demo or inspect cached project indexes.
            </p>
          </div>
        </div>
      )}

      <section className="feature-row">
        <div>
          <Box /> <b>3D Structure</b>
          <span>Explore repository hierarchy and module layout spatially.</span>
        </div>
        <div>
          <Box /> <b>Project Insights</b>
          <span>Accurate lines of code, language breakdown, and safety limits.</span>
        </div>
        <div>
          <Box /> <b>Real Dependencies</b>
          <span>Lexically parsed imports, circular cycle detection, and BFS paths.</span>
        </div>
      </section>

      <div className="section-heading">
        <h2>Your Projects</h2>
        <button
          className="primary small"
          onClick={() => setImporting(true)}
          disabled={!browserSupported}
          title={browserSupported ? 'Open a project' : 'Requires Chromium desktop'}
        >
          <Plus size={15} />
          Open Project
        </button>
      </div>

      {loadError && <div className="error-box" role="alert">{loadError}</div>}

      <section className="project-cards">
        {projects.map((project) => {
          const status = statuses[project.id] ?? 'unavailable';
          const isRefreshing = refreshingId === project.id;
          const isPendingDelete = deleteConfirmId === project.id;
          const isStale = (project.analysisConfig?.scannerAnalysisVersion ?? 0) < SCANNER_ANALYSIS_VERSION;
          const isPendingStale = stalePromptId === project.id;

          return (
            <article className="project-card" key={project.id}>
              <button
                className="project-card-open"
                onClick={() => void openProject(project.id)}
                aria-label={`Open ${project.name}`}
              >
                <div className="project-card-top">
                  <span className="project-icon">
                    <Box />
                  </span>
                  <div className="status-badges">
                    {isStale && status === 'connected' && (
                      <span className="card-badge index-needs-refresh" title="Project was indexed with an older analysis version; refresh recommended">
                        <RefreshCw size={10} /> Index needs refresh
                      </span>
                    )}
                    {isStale && status === 'permission-required' && (
                      <span className="card-badge index-needs-refresh" title="Permission required to refresh outdated index">
                        <RefreshCw size={10} /> Index needs refresh — reconnect to update
                      </span>
                    )}
                    {isStale && status === 'unavailable' && (
                      <span className="card-badge outdated" title="Viewing outdated cached index">
                        <AlertTriangle size={10} /> Viewing outdated cached index
                      </span>
                    )}
                    {!isStale && status === 'connected' && (
                      <span className="card-badge connected" title="Direct folder access active">
                        <CheckCircle2 size={10} /> Connected
                      </span>
                    )}
                    {!isStale && status === 'permission-required' && (
                      <span className="card-badge permission" title="Permission required to rescan">
                        <AlertTriangle size={10} /> Reconnect needed
                      </span>
                    )}
                    {!isStale && status === 'unavailable' && (
                      <span className="card-badge unavailable" title="Folder handle disconnected or unavailable">
                        <Unplug size={10} /> Disconnected
                      </span>
                    )}
                  </div>
                </div>

                <h3>{project.name}</h3>
                <p>
                  {project.metrics.files.toLocaleString()} files · {project.metrics.totalLoc.toLocaleString()} lines · {compactBytes(project.metrics.indexedBytes)}
                  {project.metrics.dependencyEdges ? ` · ${project.metrics.dependencyEdges.toLocaleString()} edges` : ''}
                </p>
                <small>{relativeTime(project.updatedAt)}</small>
              </button>

              <div className="project-card-footer">
                <div className="project-actions">
                  {status === 'connected' && (
                    <button
                      className={`action-btn ${isStale ? 'highlight' : ''}`}
                      onClick={(e) => void handleRefreshOrReconnect(project.id, e)}
                      disabled={isRefreshing}
                      title="Run incremental refresh for new, modified, or deleted files"
                    >
                      <RefreshCw size={11} className={isRefreshing ? 'spin' : ''} />
                      {isRefreshing ? 'Refreshing...' : isStale ? 'Refresh Index' : 'Refresh'}
                    </button>
                  )}
                  {status === 'permission-required' && (
                    <button
                      className="action-btn highlight"
                      onClick={(e) => void handleRefreshOrReconnect(project.id, e)}
                      disabled={isRefreshing}
                      title="Request browser permission to rescan folder"
                    >
                      <RefreshCw size={11} className={isRefreshing ? 'spin' : ''} />
                      {isRefreshing ? 'Prompting...' : isStale ? 'Reconnect to update' : 'Reconnect'}
                    </button>
                  )}
                  {status === 'unavailable' && browserSupported && (
                    <button
                      className="action-btn"
                      onClick={(e) => void handleRelocateFolder(project.id, e)}
                      disabled={isRefreshing}
                      title="Select new folder location to reconnect this index"
                    >
                      <FolderOpen size={11} />
                      Relocate
                    </button>
                  )}
                </div>

                <button
                  className="project-remove"
                  title="Remove cached NEXUS index"
                  aria-label={`Remove ${project.name} index`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(project.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {isPendingStale && (
                <div className="stale-prompt-overlay" onClick={(e) => e.stopPropagation()}>
                  <p><b>Index Needs Refresh</b></p>
                  <small>
                    {status === 'connected'
                      ? 'This project was indexed with an older scanner version. Refresh now to apply current exclusion rules and dependency parser updates.'
                      : 'Folder reconnect is required to update this index to current scanner rules.'}
                  </small>
                  <div className="stale-prompt-actions">
                    {status === 'connected' && (
                      <button
                        className="confirm-delete-btn"
                        style={{ background: '#7C3AED', borderColor: '#8B5CF6', color: 'white' }}
                        onClick={(e) => {
                          setStalePromptId(null);
                          void handleRefreshOrReconnect(project.id, e);
                        }}
                      >
                        Refresh Index (Recommended)
                      </button>
                    )}
                    {status === 'permission-required' && (
                      <button
                        className="confirm-delete-btn"
                        style={{ background: '#7C3AED', borderColor: '#8B5CF6', color: 'white' }}
                        onClick={(e) => {
                          setStalePromptId(null);
                          void handleRefreshOrReconnect(project.id, e);
                        }}
                      >
                        Reconnect & Refresh
                      </button>
                    )}
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setStalePromptId(null);
                        void openProject(project.id, true);
                      }}
                    >
                      View Outdated Cache
                    </button>
                  </div>
                </div>
              )}

              {isPendingDelete && (
                <div className="delete-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                  <p>Delete cached index for <b>{project.name}</b>?</p>
                  <small>Files on disk are NEVER touched.</small>
                  <div className="delete-confirm-actions">
                    <button className="confirm-delete-btn" onClick={() => void confirmRemove(project.id)}>
                      Remove
                    </button>
                    <button className="cancel-btn" onClick={() => setDeleteConfirmId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}

        <button
          className="new-card"
          onClick={() => setImporting(true)}
          disabled={!browserSupported}
          title={browserSupported ? 'Select a folder to analyze' : 'Requires Chromium desktop'}
        >
          <Plus />
          <b>Open a Project</b>
          <span>{browserSupported ? 'Select a folder to analyze' : 'Chromium desktop required'}</span>
        </button>
      </section>

      {!projects.length && (
        <p className="empty-hint">
          No local projects saved yet. The curated demo is synthetic and is never mixed into your recent-project list.
        </p>
      )}

      {importing && (
        <ImportProject
          onClose={() => {
            setImporting(false);
            void refreshList();
          }}
        />
      )}
    </main>
  );
}

