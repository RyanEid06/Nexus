import { useMemo } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Box,
  Compass,
  FileCode2,
  Files,
  Folder,
  HardDrive,
  Layers3,
  Network,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';
import { WorkspaceTabs } from './WorkspaceTabs';
import { FileViewer } from './FileViewer';

export function AnalyticsPage() {
  const project = useAppStore((s) => s.project);
  const selectNode = useAppStore((s) => s.selectNode);
  const setPage = useAppStore((s) => s.setPage);
  const openFileViewer = useAppStore((s) => s.openFileViewer);
  const expandNode = useAppStore((s) => s.expandNode);

  const m = project?.metrics;
  const deps = project?.dependencies;

  // 1. Largest Files by size
  const largestFiles = useMemo(() => {
    if (!project) return [];
    return project.nodes
      .filter((node) => node.kind === 'file')
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 6);
  }, [project]);

  // 2. Biggest Subsystems / Folders by descendant files & LOC
  const biggestFolders = useMemo(() => {
    if (!project) return [];
    return project.nodes
      .filter((node) => node.kind === 'directory' && node.depth >= 1)
      .sort((a, b) => (b.descendantFiles ?? 0) - (a.descendantFiles ?? 0) || b.loc - a.loc)
      .slice(0, 6);
  }, [project]);

  // 3. Dependency Metrics: In-Degree, Out-Degree, Connectedness, Unresolved
  const { fanInList, fanOutList, connectedList, unresolvedList } = useMemo(() => {
    if (!project || !deps?.edges) {
      return { fanInList: [], fanOutList: [], connectedList: [], unresolvedList: [] };
    }

    const inMap = new Map<string, number>();
    const outMap = new Map<string, number>();
    const unresMap = new Map<string, number>();

    for (const edge of deps.edges) {
      if (edge.isExternal) continue;

      if (edge.isResolved) {
        // Outgoing from source
        outMap.set(edge.sourcePath, (outMap.get(edge.sourcePath) ?? 0) + 1);
        // Incoming to target
        const target = edge.targetResolvedPath ?? edge.targetPath;
        inMap.set(target, (inMap.get(target) ?? 0) + 1);
      } else {
        // Unresolved edge
        unresMap.set(edge.sourcePath, (unresMap.get(edge.sourcePath) ?? 0) + 1);
      }
    }

    // Most depended-upon (Highest Fan-In)
    const fanIn = Array.from(inMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    // Highest Fan-Out
    const fanOut = Array.from(outMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    // Most Connected (In + Out)
    const allPaths = new Set([...inMap.keys(), ...outMap.keys()]);
    const connected = Array.from(allPaths)
      .map((path) => ({
        path,
        total: (inMap.get(path) ?? 0) + (outMap.get(path) ?? 0),
        in: inMap.get(path) ?? 0,
        out: outMap.get(path) ?? 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // Unresolved Hotspots
    const unresolved = Array.from(unresMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return { fanInList: fanIn, fanOutList: fanOut, connectedList: connected, unresolvedList: unresolved };
  }, [project, deps]);

  if (!project || !m) return null;

  const handleOpenPath = (path: string) => {
    const node = project.nodes.find((n) => n.path === path);
    if (node) {
      selectNode(node.id);
      if (node.kind === 'file') {
        openFileViewer(node.id);
      } else {
        expandNode(node.id);
        setPage('graph');
      }
    }
  };

  const handleShowMap = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const node = project.nodes.find((n) => n.path === path);
    if (node) {
      selectNode(node.id);
      expandNode(node.id);
      setPage('graph');
    }
  };

  const circularCycles = deps?.circularCycles ?? deps?.circularDependencies ?? [];

  return (
    <main className="project-page">
      <WorkspaceTabs />
      <div className="page analytics-page">
        <div className="page-title">
          <div>
            <p>PROJECT OVERVIEW & ARCHITECTURE</p>
            <h1>Project Insights</h1>
            <span>Deterministic topological and volumetric metrics for {project.name}.</span>
          </div>
        </div>

        {/* Global Volume Metrics */}
        <section className="metric-cards">
          <article>
            <Files />
            <b>{m.files.toLocaleString()}</b>
            <span>Indexed files</span>
          </article>
          <article>
            <HardDrive />
            <b>{compactBytes(m.indexedBytes)}</b>
            <span>Indexed file size</span>
          </article>
          <article>
            <BarChart3 />
            <b>{m.totalLoc.toLocaleString()}</b>
            <span>Physical analyzed lines</span>
          </article>
          <article>
            <Layers3 />
            <b>{compactBytes(m.analyzedTextBytes)}</b>
            <span>Text actually analyzed</span>
          </article>
        </section>

        {/* Dependency Architecture Metrics */}
        {deps && (
          <section className="metric-cards">
            <article>
              <Network />
              <b>{(m.dependencyEdges ?? deps.edges.length).toLocaleString()}</b>
              <span>Resolved Internal Edges</span>
            </article>
            <article>
              <Box />
              <b>{deps.externalPackages.length.toLocaleString()}</b>
              <span>External NPM Packages</span>
            </article>
            <article className={circularCycles.length > 0 ? 'warning-card' : ''}>
              <RefreshCw />
              <b>{circularCycles.length}</b>
              <span>Circular Dependency Cycles</span>
            </article>
            <article>
              <button
                className="action-btn"
                style={{ gridColumn: '1 / -1', justifyContent: 'center', height: '100%', padding: '12px' }}
                onClick={() => setPage('dependencies')}
              >
                Open Dependencies Explorer →
              </button>
            </article>
          </section>
        )}

        {/* Architecture Insights Grid */}
        <h2 className="section-title">Architectural Topology</h2>
        <div className="analytics-grid">
          {/* Most Connected Modules */}
          <article className="panel">
            <h2>Most Connected Files (In + Out)</h2>
            <div className="ranked-list">
              {connectedList.map(({ path, total, in: inCount, out: outCount }) => (
                <div key={path} className="ranked-item" onClick={() => handleOpenPath(path)}>
                  <div className="ranked-item-info">
                    <FileCode2 size={13} className="icon-purple" />
                    <span title={path}>{path}</span>
                  </div>
                  <div className="ranked-item-meta">
                    <b>{total} edges</b>
                    <small>({inCount} in · {outCount} out)</small>
                    <button
                      className="mini-icon-btn"
                      onClick={(e) => handleShowMap(e, path)}
                      title="Show on Map"
                    >
                      <Compass size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {!connectedList.length && <p className="muted">No internal dependency edges recorded.</p>}
            </div>
          </article>

          {/* Highest Fan-In (Most Depended-Upon) */}
          <article className="panel">
            <h2>Highest Fan-In (Most Depended-Upon)</h2>
            <div className="ranked-list">
              {fanInList.map(([path, count]) => (
                <div key={path} className="ranked-item" onClick={() => handleOpenPath(path)}>
                  <div className="ranked-item-info">
                    <FileCode2 size={13} className="icon-cyan" />
                    <span title={path}>{path}</span>
                  </div>
                  <div className="ranked-item-meta">
                    <b>{count} importer{count !== 1 ? 's' : ''}</b>
                    <button
                      className="mini-icon-btn"
                      onClick={(e) => handleShowMap(e, path)}
                      title="Show on Map"
                    >
                      <Compass size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {!fanInList.length && <p className="muted">No depended-upon files.</p>}
            </div>
          </article>

          {/* Highest Fan-Out */}
          <article className="panel">
            <h2>Highest Fan-Out (Most Imports)</h2>
            <div className="ranked-list">
              {fanOutList.map(([path, count]) => (
                <div key={path} className="ranked-item" onClick={() => handleOpenPath(path)}>
                  <div className="ranked-item-info">
                    <FileCode2 size={13} className="icon-indigo" />
                    <span title={path}>{path}</span>
                  </div>
                  <div className="ranked-item-meta">
                    <b>{count} imports</b>
                    <button
                      className="mini-icon-btn"
                      onClick={(e) => handleShowMap(e, path)}
                      title="Show on Map"
                    >
                      <Compass size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {!fanOutList.length && <p className="muted">No outgoing internal imports.</p>}
            </div>
          </article>

          {/* Biggest Folders / Subsystems */}
          <article className="panel">
            <h2>Biggest Folders by File Count</h2>
            <div className="ranked-list">
              {biggestFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="ranked-item"
                  onClick={() => {
                    selectNode(folder.id);
                    expandNode(folder.id);
                    setPage('structure');
                  }}
                >
                  <div className="ranked-item-info">
                    <Folder size={13} className="icon-warning" />
                    <span title={folder.path}>{folder.path}/</span>
                  </div>
                  <div className="ranked-item-meta">
                    <b>{(folder.descendantFiles ?? 0).toLocaleString()} files</b>
                    <small>({folder.loc.toLocaleString()} loc)</small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Unresolved Import Hotspots or Circular Dependencies */}
          {circularCycles.length > 0 ? (
            <article className="panel">
              <h2 className="warning-heading">
                <AlertTriangle size={15} /> Circular Dependency Hotspots
              </h2>
              <div className="ranked-list">
                {circularCycles.map((cycle, idx) => (
                  <div
                    key={idx}
                    className="ranked-item"
                    onClick={() => {
                      const first = project.nodes.find((n) => n.path === cycle[0]);
                      if (first) selectNode(first.id);
                      setPage('dependencies');
                    }}
                  >
                    <div className="ranked-item-info">
                      <RefreshCw size={13} className="icon-warning" />
                      <span>Group #{idx + 1}: {cycle.slice(0, 2).map((p) => p.split('/').pop()).join(' ↔ ')}{cycle.length > 2 ? ` (+${cycle.length - 2} more)` : ''}</span>
                    </div>
                    <div className="ranked-item-meta">
                      <b>{cycle.length} files</b>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : unresolvedList.length > 0 ? (
            <article className="panel">
              <h2>Unresolved Import Hotspots</h2>
              <div className="ranked-list">
                {unresolvedList.map(([path, count]) => (
                  <div key={path} className="ranked-item" onClick={() => handleOpenPath(path)}>
                    <div className="ranked-item-info">
                      <AlertTriangle size={13} className="icon-warning" />
                      <span title={path}>{path}</span>
                    </div>
                    <div className="ranked-item-meta">
                      <b>{count} unresolved</b>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : (
            <article className="panel">
              <h2>Largest Indexed Files</h2>
              <div className="ranked-list">
                {largestFiles.map((file) => (
                  <div key={file.id} className="ranked-item" onClick={() => handleOpenPath(file.path)}>
                    <div className="ranked-item-info">
                      <FileCode2 size={13} />
                      <span title={file.path}>{file.path}</span>
                    </div>
                    <div className="ranked-item-meta">
                      <b>{compactBytes(file.sizeBytes)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          {/* Language Distribution */}
          <article className="panel">
            <h2>Language Distribution</h2>
            <div className="language-bars">
              {m.languages.length ? (
                m.languages.map((lang) => (
                  <div key={lang.language}>
                    <label>
                      <b>{lang.language}</b>
                      <span>{lang.percentage.toFixed(1)}% ({lang.loc.toLocaleString()} loc)</span>
                    </label>
                    <i>
                      <em style={{ width: `${lang.percentage}%` }} />
                    </i>
                  </div>
                ))
              ) : (
                <p className="muted">No analyzed language data yet.</p>
              )}
            </div>
          </article>
        </div>
      </div>

      {/* Real File Viewer Modal */}
      <FileViewer />
    </main>
  );
}
