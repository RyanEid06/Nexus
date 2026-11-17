import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  Layers,
  Orbit,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { SCANNER_ANALYSIS_VERSION, type ProjectIndex } from '../domain/models';
import { demoProject } from '../data/demoProject';
import { CURATED_SAMPLE_PROJECTS } from '../data/sampleProjects';
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
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ProjectsPage() {
  const [importing, setImporting] = useState(false);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [statuses, setStatuses] = useState<Record<string, HandleConnectionStatus>>({});
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [stalePromptId, setStalePromptId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedLocalIds, setSelectedLocalIds] = useState<Set<string>>(new Set());
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(
    () => new Set(CURATED_SAMPLE_PROJECTS.map((p) => p.id))
  );
  const [loadError, setLoadError] = useState('');

  const setProject = useAppStore((s) => s.setProject);
  const launchConstellation = useAppStore((s) => s.launchConstellation);
  const currentProject = useAppStore((s) => s.project);
  const browserSupported = supportsLocalDirectoryPicker();

  const refreshList = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);
      setLoadError('');

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

  function toggleLocalSelection(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedLocalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSampleSelection(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedSampleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLaunchSelectedConstellation() {
    setLoadError('');
    try {
      const loadedLocals = await Promise.all(
        Array.from(selectedLocalIds).map((id) => loadProject(id))
      );
      const validLocals = loadedLocals.filter((p): p is ProjectIndex => Boolean(p));
      const samples = CURATED_SAMPLE_PROJECTS.filter((p) => selectedSampleIds.has(p.id));
      const combined = [...validLocals, ...samples];

      if (combined.length >= 2) {
        launchConstellation(combined, combined[0].id);
      } else {
        launchConstellation(CURATED_SAMPLE_PROJECTS, demoProject.id);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load selected projects.');
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
        setLoadError('Folder handle is no longer accessible. Use "Relocate" to re-link.');
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
      await validateRelocationCandidate(prevProject, newHandle);
      const updated = await scanDirectoryHandle(newHandle, { previousProject: prevProject });
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
      setSelectedLocalIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refreshList();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to remove project.');
    }
  }

  const totalChecked = selectedLocalIds.size + selectedSampleIds.size;

  return (
    <main className="page projects-page">
      <header className="hero">
        <div className="hero-top">
          <div className="hero-brand-lockup">
            <img src="/nexus-mark.svg" alt="NEXUS" />
            <div>
              <span className="hero-eyebrow">ARCHITECTURAL OBSERVATORY</span>
              <h1>NEXUS</h1>
            </div>
          </div>

          <div className="hero-cta-group">
            <button
              className="primary"
              onClick={() => setImporting(true)}
              disabled={!browserSupported}
              title={browserSupported ? 'Select a local directory' : 'Requires a supported Chromium desktop browser'}
            >
              <FolderOpen size={16} />
              Open Local Folder
            </button>
            <button
              className="secondary-cyan"
              onClick={() => void handleLaunchSelectedConstellation()}
              title="Open Multi-Project Constellation in 2D and 3D"
            >
              <Orbit size={16} />
              Launch Multi-Project Constellation
            </button>
            <button className="ghost" onClick={() => setProject(demoProject)}>
              Explore Atlas Demo
            </button>
          </div>
        </div>

        <p className="hero-lead">
          Spatial 2D &amp; 3D topology, lexically resolved import graphs, and multi-repository constellation comparison. Runs entirely client-side with zero uploads.
        </p>

        <div className="hero-pillars">
          <div>
            <Layers size={15} />
            <span>Precision 2D Blueprint &amp; 3D WebGL CAD Topology</span>
          </div>
          <div>
            <Boxes size={15} />
            <span>Multi-Project Orbital Constellation &amp; Shared Dependency Bridges</span>
          </div>
          <div>
            <GitBranch size={15} />
            <span>Tarjan Cycle Detection, Fan-In/Out &amp; BFS Shortest Paths</span>
          </div>
        </div>
      </header>

      {!browserSupported && (
        <div className="browser-banner" role="alert">
          <AlertCircle size={18} />
          <div>
            <b>Local Directory Picker Unavailable</b>
            <p>
              Direct folder access uses the File System Access API (Chrome, Edge, Brave, Opera). You can still explore all curated sample architectures and multi-project constellations below.
            </p>
          </div>
        </div>
      )}

      {loadError && <div className="error-box" role="alert">{loadError}</div>}

      {/* Local Projects Section */}
      <div className="section-heading">
        <div>
          <h2>Local Repositories</h2>
          <small className="section-sub">Indexed directly on disk via File System Access</small>
        </div>
        <div className="section-actions">
          {selectedLocalIds.size >= 2 && (
            <button className="secondary-cyan small" onClick={() => void handleLaunchSelectedConstellation()}>
              <Orbit size={14} />
              Constellate Selected ({selectedLocalIds.size})
            </button>
          )}
          <button
            className="primary small"
            onClick={() => setImporting(true)}
            disabled={!browserSupported}
            title={browserSupported ? 'Open a local folder' : 'Requires Chromium desktop'}
          >
            <Plus size={14} />
            Add Folder
          </button>
        </div>
      </div>

      <section className="project-cards">
        {projects.map((project) => {
          const status = statuses[project.id] ?? 'unavailable';
          const isRefreshing = refreshingId === project.id;
          const isPendingDelete = deleteConfirmId === project.id;
          const isStale = (project.analysisConfig?.scannerAnalysisVersion ?? 0) < SCANNER_ANALYSIS_VERSION;
          const isPendingStale = stalePromptId === project.id;
          const isChecked = selectedLocalIds.has(project.id);

          return (
            <article className={`project-card ${isChecked ? 'checked' : ''}`} key={project.id}>
              <button
                className={`card-select-toggle ${isChecked ? 'checked' : ''}`}
                onClick={(e) => toggleLocalSelection(project.id, e)}
                title="Select for Multi-Project Constellation"
                aria-label={`Select ${project.name} for constellation`}
                aria-pressed={isChecked}
              >
                {isChecked && <Check size={12} />}
              </button>

              <button
                className="project-card-open"
                onClick={() => void openProject(project.id)}
                aria-label={`Open ${project.name}`}
              >
                <div className="project-card-top">
                  <span className="project-icon">
                    <FolderOpen size={17} />
                  </span>
                  <div className="status-tag-line">
                    {isStale && status === 'connected' && (
                      <span className="status-tag warning">
                        <RefreshCw size={10} /> Refresh recommended
                      </span>
                    )}
                    {isStale && status !== 'connected' && (
                      <span className="status-tag warning">
                        <AlertTriangle size={10} /> Outdated cache
                      </span>
                    )}
                    {!isStale && status === 'connected' && (
                      <span className="status-tag connected">
                        <CheckCircle2 size={10} /> Connected
                      </span>
                    )}
                    {!isStale && status === 'permission-required' && (
                      <span className="status-tag warning">
                        <AlertTriangle size={10} /> Reconnect
                      </span>
                    )}
                    {!isStale && status === 'unavailable' && (
                      <span className="status-tag muted">
                        <Unplug size={10} /> Disconnected
                      </span>
                    )}
                  </div>
                </div>

                <h3>{project.name}</h3>
                <p className="tabular-nums">
                  {project.metrics.files.toLocaleString()} files · {project.metrics.totalLoc.toLocaleString()} loc · {compactBytes(project.metrics.indexedBytes)}
                </p>
                <small>Updated {relativeTime(project.updatedAt)}</small>
              </button>

              <div className="project-card-footer">
                <div className="project-actions">
                  {status === 'connected' && (
                    <button
                      className={`action-btn ${isStale ? 'highlight' : ''}`}
                      onClick={(e) => void handleRefreshOrReconnect(project.id, e)}
                      disabled={isRefreshing}
                    >
                      <RefreshCw size={11} className={isRefreshing ? 'spin' : ''} />
                      {isRefreshing ? 'Refreshing…' : isStale ? 'Refresh Index' : 'Refresh'}
                    </button>
                  )}
                  {status === 'permission-required' && (
                    <button
                      className="action-btn highlight"
                      onClick={(e) => void handleRefreshOrReconnect(project.id, e)}
                      disabled={isRefreshing}
                    >
                      <RefreshCw size={11} className={isRefreshing ? 'spin' : ''} />
                      {isRefreshing ? 'Prompting…' : 'Reconnect'}
                    </button>
                  )}
                  {status === 'unavailable' && browserSupported && (
                    <button
                      className="action-btn"
                      onClick={(e) => void handleRelocateFolder(project.id, e)}
                      disabled={isRefreshing}
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
                  <small>Refresh now to apply updated exclusion rules and dependency parsing.</small>
                  <div className="stale-prompt-actions">
                    {(status === 'connected' || status === 'permission-required') && (
                      <button
                        className="primary small"
                        onClick={(e) => {
                          setStalePromptId(null);
                          void handleRefreshOrReconnect(project.id, e);
                        }}
                      >
                        Refresh Index
                      </button>
                    )}
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setStalePromptId(null);
                        void openProject(project.id, true);
                      }}
                    >
                      Open Cached
                    </button>
                  </div>
                </div>
              )}

              {isPendingDelete && (
                <div className="delete-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                  <p>Remove index for <b>{project.name}</b>?</p>
                  <small>Disk files are never touched.</small>
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
          title={browserSupported ? 'Select a local folder to index' : 'Requires Chromium desktop'}
        >
          <Plus size={20} />
          <b>Index Local Directory</b>
          <span>{browserSupported ? 'Client-side analysis only' : 'Chromium desktop required'}</span>
        </button>
      </section>

      {/* Curated Multi-Project Fleet */}
      <div className="section-heading" style={{ marginTop: '30px' }}>
        <div>
          <h2>Curated Architecture Fleet</h2>
          <small className="section-sub">Synthetic reference codebases for immediate 2D, 3D, and Multi-Project exploration</small>
        </div>
        <button
          className="secondary-cyan small"
          disabled={totalChecked < 2}
          onClick={() => void handleLaunchSelectedConstellation()}
        >
          <Orbit size={14} />
          Visualize Selected ({totalChecked})
        </button>
      </div>

      <section className="project-cards sample-cards">
        {CURATED_SAMPLE_PROJECTS.map((sample) => {
          const isChecked = selectedSampleIds.has(sample.id);
          const cycleCount = sample.metrics.circularDependenciesCount ?? sample.dependencies?.circularDependencies.length ?? 0;
          const dominantLang = sample.metrics.languages[0]?.language ?? 'TypeScript';

          return (
            <article className={`project-card sample-card ${isChecked ? 'checked' : ''}`} key={sample.id}>
              <button
                className={`card-select-toggle ${isChecked ? 'checked' : ''}`}
                onClick={(e) => toggleSampleSelection(sample.id, e)}
                title="Include in Multi-Project Constellation"
                aria-label={`Include ${sample.name} in constellation`}
                aria-pressed={isChecked}
              >
                {isChecked && <Check size={12} />}
              </button>

              <button
                className="project-card-open"
                onClick={() => setProject(sample)}
                aria-label={`Open ${sample.name}`}
              >
                <div className="project-card-top">
                  <span className="project-icon sample">
                    <Boxes size={17} />
                  </span>
                  <div className="status-tag-line">
                    <span className="status-tag connected">{dominantLang}</span>
                    {cycleCount > 0 && (
                      <span className="status-tag warning">
                        <AlertTriangle size={10} /> {cycleCount} cycle
                      </span>
                    )}
                  </div>
                </div>

                <h3>{sample.name}</h3>
                <p className="tabular-nums">
                  {sample.metrics.files} files · {sample.metrics.totalLoc.toLocaleString()} loc · {sample.metrics.dependencyEdges} edges
                </p>
                <small>
                  Packages: {(sample.dependencies?.externalPackages ?? []).join(', ') || 'none'}
                </small>
              </button>

              <div className="project-card-footer">
                <span className="sample-kind-note">Reference index</span>
                <button className="action-btn highlight" onClick={() => setProject(sample)}>
                  Open Map →
                </button>
              </div>
            </article>
          );
        })}
      </section>

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
