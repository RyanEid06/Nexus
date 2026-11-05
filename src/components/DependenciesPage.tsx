import React, { useMemo, useState } from 'react';
import {
  GitBranch,
  Network,
  ArrowRight,
  AlertTriangle,
  Package,
  Layers,
  Search,
  CheckCircle2,
  FileCode2,
  CornerDownRight,
  Compass,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { WorkspaceTabs } from './WorkspaceTabs';
import { findShortestDependencyPath } from '../services/dependencies';
import type { DependencyEdge } from '../domain/models';

type DependencyTab = 'explorer' | 'cycles' | 'path-finder' | 'external';

export function DependenciesPage() {
  const project = useAppStore((s) => s.project);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);

  const [activeTab, setActiveTab] = useState<DependencyTab>('explorer');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedPath, setFocusedPath] = useState<string>('');
  const [sourcePath, setSourcePath] = useState<string>('');
  const [targetPath, setTargetPath] = useState<string>('');

  const deps = project?.dependencies;
  const edges = useMemo(() => deps?.edges ?? [], [deps]);
  const circulars = useMemo(() => deps?.circularDependencies ?? [], [deps]);
  const externalPackages = useMemo(() => deps?.externalPackages ?? [], [deps]);

  // All analyzable modules with dependencies
  const modulePaths = useMemo(() => {
    if (!project) return [];
    const set = new Set<string>();
    for (const edge of edges) {
      set.add(edge.sourcePath);
      if (!edge.isExternal && edge.isResolved) {
        set.add(edge.targetPath);
      }
    }
    return Array.from(set).sort();
  }, [project, edges]);

  // Synchronize focused module with selected node if applicable
  const currentFocusedPath = useMemo(() => {
    if (focusedPath) return focusedPath;
    if (selectedNodeId && project) {
      const node = project.nodes.find((n) => n.id === selectedNodeId);
      if (node && node.kind === 'file' && modulePaths.includes(node.path)) {
        return node.path;
      }
    }
    return modulePaths[0] ?? '';
  }, [focusedPath, selectedNodeId, project, modulePaths]);

  // Incoming and outgoing dependencies for focused module
  const { outgoing, incoming, external, unresolved } = useMemo(() => {
    if (!currentFocusedPath) return { outgoing: [], incoming: [], external: [], unresolved: [] };

    const out: DependencyEdge[] = [];
    const inc: DependencyEdge[] = [];
    const ext: DependencyEdge[] = [];
    const unres: DependencyEdge[] = [];

    for (const edge of edges) {
      if (edge.sourcePath === currentFocusedPath) {
        if (edge.isExternal) {
          ext.push(edge);
        } else if (!edge.isResolved) {
          unres.push(edge);
        } else {
          out.push(edge);
        }
      }
      if (!edge.isExternal && edge.isResolved && edge.targetPath === currentFocusedPath) {
        inc.push(edge);
      }
    }

    return { outgoing: out, incoming: inc, external: ext, unresolved: unres };
  }, [currentFocusedPath, edges]);

  // Filtered module list for the explorer sidebar
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return modulePaths;
    return modulePaths.filter((p) => p.toLowerCase().includes(q));
  }, [modulePaths, searchQuery]);

  // Path finder shortest path result
  const calculatedPath = useMemo(() => {
    if (!sourcePath || !targetPath || sourcePath === targetPath) return null;
    return findShortestDependencyPath(sourcePath, targetPath, edges);
  }, [sourcePath, targetPath, edges]);

  // External package usage map
  const packageUsage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pkg of externalPackages) {
      map.set(pkg, []);
    }
    for (const edge of edges) {
      if (edge.isExternal && map.has(edge.targetPath)) {
        const list = map.get(edge.targetPath)!;
        if (!list.includes(edge.sourcePath)) {
          list.push(edge.sourcePath);
        }
      }
    }
    return map;
  }, [externalPackages, edges]);

  if (!project) return null;

  const handleSelectModule = (path: string) => {
    setFocusedPath(path);
    const node = project.nodes.find((n) => n.path === path);
    if (node) {
      selectNode(node.id);
    }
  };

  return (
    <main className="project-page">
      <WorkspaceTabs />
      <div className="page dependencies-page">
        {/* Header */}
        <div className="page-title">
          <div>
            <p>CODE ARCHITECTURE</p>
            <h1>Module Dependencies</h1>
            <span>Deterministic import, export, and require analysis parsed from local source code.</span>
          </div>

          <div className="tab-group" role="tablist">
            <button
              className={`pill-tab ${activeTab === 'explorer' ? 'active' : ''}`}
              onClick={() => setActiveTab('explorer')}
            >
              <Network size={14} /> Module Explorer
            </button>
            <button
              className={`pill-tab ${activeTab === 'cycles' ? 'active' : ''}`}
              onClick={() => setActiveTab('cycles')}
            >
              <AlertTriangle size={14} /> Cycles ({circulars.length})
            </button>
            <button
              className={`pill-tab ${activeTab === 'path-finder' ? 'active' : ''}`}
              onClick={() => setActiveTab('path-finder')}
            >
              <Compass size={14} /> Path Finder
            </button>
            <button
              className={`pill-tab ${activeTab === 'external' ? 'active' : ''}`}
              onClick={() => setActiveTab('external')}
            >
              <Package size={14} /> Packages ({externalPackages.length})
            </button>
          </div>
        </div>

        {/* Overview Metric Row */}
        <section className="metric-cards">
          <article>
            <GitBranch />
            <b>{project.metrics.dependencyEdges.toLocaleString()}</b>
            <span>Resolved Internal Edges</span>
          </article>
          <article>
            <Layers />
            <b>{modulePaths.length.toLocaleString()}</b>
            <span>Connected Modules</span>
          </article>
          <article>
            <Package />
            <b>{externalPackages.length.toLocaleString()}</b>
            <span>External NPM Packages</span>
          </article>
          <article className={circulars.length > 0 ? 'warning-card' : ''}>
            <AlertTriangle />
            <b>{circulars.length}</b>
            <span>Circular Dependencies</span>
          </article>
        </section>

        {/* Tab 1: Module Explorer */}
        {activeTab === 'explorer' && (
          <div className="deps-layout">
            {/* Left Module Directory */}
            <aside className="panel deps-sidebar">
              <div className="search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter modules…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="deps-module-list">
                {filteredModules.map((path) => (
                  <button
                    key={path}
                    className={`module-item ${path === currentFocusedPath ? 'active' : ''}`}
                    onClick={() => handleSelectModule(path)}
                  >
                    <FileCode2 size={13} />
                    <span title={path}>{path}</span>
                  </button>
                ))}
                {!filteredModules.length && (
                  <p className="muted empty-hint">No modules match “{searchQuery}”.</p>
                )}
              </div>
            </aside>

            {/* Right Details Panel */}
            <section className="panel deps-details">
              {currentFocusedPath ? (
                <>
                  <div className="deps-focus-header">
                    <div>
                      <small>FOCUSED MODULE</small>
                      <h2>{currentFocusedPath}</h2>
                    </div>
                    <button
                      className="ghost small"
                      onClick={() => {
                        setSourcePath(currentFocusedPath);
                        setActiveTab('path-finder');
                      }}
                    >
                      Use in Path Finder →
                    </button>
                  </div>

                  {/* Outgoing Dependencies */}
                  <div className="deps-section">
                    <h3>
                      Outgoing Imports ({outgoing.length})
                      <small>What {currentFocusedPath.split('/').pop()} imports</small>
                    </h3>
                    <div className="deps-grid">
                      {outgoing.map((edge) => (
                        <div key={edge.id} className="dep-edge-card">
                          <div className="edge-top">
                            <span className={`badge ${edge.type}`}>{edge.type}</span>
                            <code>{edge.specifier}</code>
                          </div>
                          <button
                            className="target-link"
                            onClick={() => handleSelectModule(edge.targetPath)}
                          >
                            <ArrowRight size={13} />
                            <span>{edge.targetPath}</span>
                          </button>
                        </div>
                      ))}
                      {!outgoing.length && <p className="muted">No internal modules imported.</p>}
                    </div>
                  </div>

                  {/* Incoming Dependents */}
                  <div className="deps-section">
                    <h3>
                      Incoming Dependents ({incoming.length})
                      <small>Modules that import {currentFocusedPath.split('/').pop()}</small>
                    </h3>
                    <div className="deps-grid">
                      {incoming.map((edge) => (
                        <div key={edge.id} className="dep-edge-card">
                          <div className="edge-top">
                            <span className={`badge ${edge.type}`}>{edge.type}</span>
                            <code>{edge.specifier}</code>
                          </div>
                          <button
                            className="target-link"
                            onClick={() => handleSelectModule(edge.sourcePath)}
                          >
                            <CornerDownRight size={13} />
                            <span>{edge.sourcePath}</span>
                          </button>
                        </div>
                      ))}
                      {!incoming.length && (
                        <p className="muted">No other local modules import this file.</p>
                      )}
                    </div>
                  </div>

                  {/* External NPM Packages */}
                  {external.length > 0 && (
                    <div className="deps-section">
                      <h3>External Packages ({external.length})</h3>
                      <div className="chip-row">
                        {external.map((edge) => (
                          <span key={edge.id} className="pkg-chip">
                            <Package size={12} />
                            <b>{edge.targetPath}</b>
                            <small>({edge.specifier})</small>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unresolved imports if any */}
                  {unresolved.length > 0 && (
                    <div className="deps-section">
                      <h3 className="unresolved-title">
                        <AlertTriangle size={14} /> Unresolved Imports ({unresolved.length})
                      </h3>
                      <div className="deps-grid">
                        {unresolved.map((edge) => (
                          <div key={edge.id} className="dep-edge-card unresolved">
                            <span className="badge">{edge.type}</span>
                            <code>{edge.specifier}</code>
                            <small>Could not resolve to indexed project file</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <p>No module selected. Choose a module from the list.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 2: Circular Dependencies */}
        {activeTab === 'cycles' && (
          <section className="panel cycles-panel">
            <div className="panel-header">
              <h2>Circular Dependencies</h2>
              <p>Detected dependency loops where modules directly or transitively import each other.</p>
            </div>

            {circulars.length > 0 ? (
              <div className="cycles-list">
                {circulars.map((cycle, idx) => (
                  <div key={idx} className="cycle-card">
                    <div className="cycle-header">
                      <AlertTriangle size={15} />
                      <b>Cycle #{idx + 1} ({cycle.length - 1} hops)</b>
                    </div>
                    <div className="cycle-steps">
                      {cycle.map((path, stepIdx) => (
                        <React.Fragment key={stepIdx}>
                          <button
                            className="cycle-step"
                            onClick={() => {
                              handleSelectModule(path);
                              setActiveTab('explorer');
                            }}
                          >
                            <FileCode2 size={13} />
                            <span>{path}</span>
                          </button>
                          {stepIdx < cycle.length - 1 && <ArrowRight size={14} className="cycle-arrow" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state clean">
                <CheckCircle2 size={32} />
                <h3>No circular dependencies detected</h3>
                <p>All parsed module relationships form a clean directed acyclic graph (DAG).</p>
              </div>
            )}
          </section>
        )}

        {/* Tab 3: Path Finder */}
        {activeTab === 'path-finder' && (
          <section className="panel path-finder-panel">
            <div className="panel-header">
              <h2>Path Finder</h2>
              <p>Find the shortest dependency chain between two modules using Breadth-First Search.</p>
            </div>

            <div className="path-inputs">
              <div>
                <label>Source Module</label>
                <select value={sourcePath} onChange={(e) => setSourcePath(e.target.value)}>
                  <option value="">Select source module…</option>
                  {modulePaths.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Target Module</label>
                <select value={targetPath} onChange={(e) => setTargetPath(e.target.value)}>
                  <option value="">Select target module…</option>
                  {modulePaths.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sourcePath && targetPath && (
              <div className="path-result">
                {calculatedPath ? (
                  <div className="path-chain">
                    <h3>
                      Shortest Path ({calculatedPath.length - 1} {calculatedPath.length === 2 ? 'hop' : 'hops'})
                    </h3>
                    <div className="steps-container">
                      {calculatedPath.map((p, idx) => (
                        <React.Fragment key={idx}>
                          <div className="path-node">
                            <span className="step-num">{idx + 1}</span>
                            <button
                              className="node-btn"
                              onClick={() => {
                                handleSelectModule(p);
                                setActiveTab('explorer');
                              }}
                            >
                              <FileCode2 size={14} />
                              <span>{p}</span>
                            </button>
                          </div>
                          {idx < calculatedPath.length - 1 && (
                            <div className="step-connector">
                              <ArrowRight size={14} />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No dependency path exists from <b>{sourcePath}</b> to <b>{targetPath}</b>.</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Tab 4: External Packages */}
        {activeTab === 'external' && (
          <section className="panel external-panel">
            <div className="panel-header">
              <h2>External NPM Packages</h2>
              <p>Third-party libraries imported by project files (resolved without traversing node_modules).</p>
            </div>

            <div className="pkg-grid">
              {externalPackages.map((pkg) => {
                const importers = packageUsage.get(pkg) ?? [];
                return (
                  <div key={pkg} className="pkg-card">
                    <div className="pkg-top">
                      <Package size={16} />
                      <h3>{pkg}</h3>
                      <span className="badge">
                        {importers.length} {importers.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>

                    <div className="importer-list">
                      {importers.slice(0, 5).map((imp) => (
                        <button
                          key={imp}
                          className="imp-link"
                          onClick={() => {
                            handleSelectModule(imp);
                            setActiveTab('explorer');
                          }}
                        >
                          <FileCode2 size={12} />
                          <span>{imp}</span>
                        </button>
                      ))}
                      {importers.length > 5 && (
                        <small className="muted">+{importers.length - 5} more files</small>
                      )}
                    </div>
                  </div>
                );
              })}
              {!externalPackages.length && (
                <div className="empty-state">
                  <p>No external package dependencies found.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
