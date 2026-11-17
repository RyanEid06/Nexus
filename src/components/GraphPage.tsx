import { useRef, useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Maximize2,
  Minimize2,
  Orbit,
  RotateCcw,
} from 'lucide-react';
import { Inspector } from './Inspector';
import { ProjectGraph } from './ProjectGraph';
import { ProjectGraph2D } from './ProjectGraph2D';
import { WorkspaceTabs } from './WorkspaceTabs';
import { FileViewer } from './FileViewer';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';
import { buildGraphIndex, computeGraphViewport } from '../services/graphViewport';
import { computeMultiProjectConstellation } from '../services/constellation';

export function GraphPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(true);

  const project = useAppStore((s) => s.project);
  const workspaceProjects = useAppStore((s) => s.workspaceProjects);
  const constellationProjectIds = useAppStore((s) => s.constellationProjectIds);
  const constellationMode = useAppStore((s) => s.constellationMode);
  const setConstellationMode = useAppStore((s) => s.setConstellationMode);
  const switchProject = useAppStore((s) => s.switchProject);

  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);
  const relationshipMode = useAppStore((s) => s.relationshipMode);
  const setRelationshipMode = useAppStore((s) => s.setRelationshipMode);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const mapFocusNodeId = useAppStore((s) => s.mapFocusNodeId);
  const mapPageOffset = useAppStore((s) => s.mapPageOffset);
  const nextMapPage = useAppStore((s) => s.nextMapPage);
  const prevMapPage = useAppStore((s) => s.prevMapPage);
  const setMapFocusNodeId = useAppStore((s) => s.setMapFocusNodeId);
  const navigateUpToParentFocus = useAppStore((s) => s.navigateUpToParentFocus);
  const isInspectorCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);

  useEffect(() => {
    setFullscreenAvailable(typeof document !== 'undefined' && Boolean(document.fullscreenEnabled));
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if (e.key === 'Escape') {
        const state = useAppStore.getState();
        if (state.constellationMode) {
          e.preventDefault();
          state.setConstellationMode(false);
          return;
        }
        if (state.project) {
          const vp = computeGraphViewport({
            project: state.project,
            mapFocusNodeId: state.mapFocusNodeId,
            selectedNodeId: state.selectedNodeId,
            expandedNodeIds: state.expandedNodeIds,
            relationshipMode: state.relationshipMode,
          });
          if (!vp.isProjectRootFocused) {
            e.preventDefault();
            state.navigateUpToParentFocus();
          }
        }
      } else if (e.key === 'Enter') {
        const state = useAppStore.getState();
        const selId = state.selectedNodeId;
        if (selId && state.project) {
          const selNode = state.project.nodes.find((n) => n.id === selId);
          if (selNode) {
            e.preventDefault();
            if (selNode.kind === 'directory') {
              state.drillDownNode(selId);
            } else if (selNode.kind === 'file') {
              state.openFileViewer(selId);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      } else if (stage.requestFullscreen) {
        await stage.requestFullscreen().catch(() => {});
      }
    } catch {
      // Gracefully ignore iframe permission denial
    }
  }

  const triggerMapAction = (action: 'fit' | 'reset' | 'focus') => {
    window.dispatchEvent(
      new CustomEvent('nexus:map-action', {
        detail: { action, nodeId: selectedNodeId, targetMode: mapMode },
      })
    );
  };

  const graphIndex = useMemo(() => (project ? buildGraphIndex(project) : null), [project]);

  const viewport = useMemo(() => {
    if (!project || constellationMode) return null;
    return computeGraphViewport({
      project,
      graphIndex: graphIndex ?? undefined,
      mapFocusNodeId,
      selectedNodeId,
      expandedNodeIds,
      relationshipMode,
      directPageOffset: mapPageOffset,
      expandedBranchLimit: 15,
    });
  }, [project, graphIndex, constellationMode, mapFocusNodeId, mapPageOffset, selectedNodeId, expandedNodeIds, relationshipMode]);

  const constellation = useMemo(() => {
    if (!constellationMode) return null;
    const idSet = new Set(constellationProjectIds);
    const selected = workspaceProjects.filter((p) => idSet.has(p.id));
    const fleet = selected.length >= 2 ? selected : workspaceProjects;
    if (fleet.length < 2) return null;
    return computeMultiProjectConstellation(fleet);
  }, [constellationMode, workspaceProjects, constellationProjectIds]);

  const canConstellation = workspaceProjects.length >= 2;

  return (
    <main className={`workspace ${isInspectorCollapsed ? 'inspector-collapsed' : ''}`}>
      <section className="workspace-main">
        <WorkspaceTabs />
        <div className="graph-stage" ref={stageRef}>
          {/* Top-left CAD Telemetry & Filter HUD */}
          <div className="map-header-controls">
            {constellation ? (
              <div className="map-filter-row">
                <div className="map-filter-bar">
                  <span className="filter-label">
                    <Boxes size={13} /> Constellation
                  </span>
                  <div className="constellation-project-chips">
                    {constellation.projects.map((cp) => (
                      <button
                        key={cp.projectId}
                        className={`constellation-chip ${cp.projectId === project?.id ? 'active' : ''}`}
                        onClick={() => {
                          switchProject(cp.projectId, 'graph');
                          setConstellationMode(true);
                        }}
                        title={`Focus ${cp.name} in constellation · ${cp.files} files · ${cp.totalLoc.toLocaleString()} loc`}
                      >
                        <span className="constellation-chip-swatch" style={{ background: cp.accentColor }} />
                        <span>{cp.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="map-status-info">
                  <span className="tabular-nums">
                    {constellation.totals.projects} projects · {constellation.totals.files.toLocaleString()} files · {constellation.totals.totalLoc.toLocaleString()} loc · {constellation.totals.sharedPackagesCount} shared packages
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="map-filter-row">
                  <div className="map-filter-bar">
                    <span className="filter-label">Layer</span>
                    <div className="filter-segmented" role="tablist">
                      {(['hierarchy', 'dependencies', 'both'] as RelationshipFilterMode[]).map((mode) => (
                        <button
                          key={mode}
                          className={`filter-btn ${relationshipMode === mode ? 'active' : ''}`}
                          onClick={() => setRelationshipMode(mode)}
                        >
                          {mode === 'hierarchy' ? 'Hierarchy' : mode === 'dependencies' ? 'Dependencies' : 'Both'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {viewport && (
                    <div className="map-status-info">
                      <span className="tabular-nums">
                        {viewport.visibleNodes.length} nodes · {viewport.totalDirectChildren.toLocaleString()} children
                        {viewport.hiddenDirectChildren > 0 && ` · +${viewport.hiddenDirectChildren.toLocaleString()} hidden`}
                        {viewport.visibleDependenciesCount > 0 && ` · ${viewport.visibleDependenciesCount} deps`}
                      </span>
                    </div>
                  )}

                  {viewport && viewport.totalDirectPages > 1 && (
                    <div className="map-pagination-bar" role="group" aria-label="Folder children pages">
                      <button
                        className="map-page-btn"
                        disabled={!viewport.hasPrevDirectPage}
                        onClick={() => prevMapPage()}
                        title="Previous 24 items"
                        aria-label="Previous 24 items"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span className="map-page-readout tabular-nums">
                        {viewport.directPageStart.toLocaleString()}–{viewport.directPageEnd.toLocaleString()} / {viewport.totalDirectChildren.toLocaleString()}
                      </span>
                      <button
                        className="map-page-btn"
                        disabled={!viewport.hasNextDirectPage}
                        onClick={() => nextMapPage()}
                        title="Next 24 items"
                        aria-label="Next 24 items"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {viewport && (
                  <div className="map-breadcrumbs-bar">
                    <div className="map-breadcrumbs-nav">
                      {!viewport.isProjectRootFocused && (
                        <button
                          className="map-back-btn"
                          onClick={() => navigateUpToParentFocus()}
                          title="Go up to parent directory (Esc)"
                          aria-label="Go up to parent directory"
                        >
                          <ArrowLeft size={12} />
                          <span>Up</span>
                        </button>
                      )}
                      <nav className="map-breadcrumbs-trail" aria-label="Directory breadcrumbs">
                        {viewport.breadcrumbTrail.map((crumb, idx) => {
                          const isLast = idx === viewport.breadcrumbTrail.length - 1;
                          const displayName = crumb.kind === 'project' ? project?.name ?? 'Root' : crumb.name;
                          return (
                            <span key={crumb.id} className="map-breadcrumb-item">
                              {idx > 0 && <span className="map-breadcrumb-sep">/</span>}
                              {isLast ? (
                                <span className="map-breadcrumb-current" aria-current="location">
                                  {displayName}
                                </span>
                              ) : (
                                <button
                                  className="map-breadcrumb-btn"
                                  onClick={() => setMapFocusNodeId(crumb.id)}
                                  title={`Focus on ${displayName}`}
                                >
                                  {displayName}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </nav>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Isolated 2D / 3D Canvas Layers */}
          <div
            className={`graph-canvas graph-canvas-layer ${mapMode === '2d' ? 'is-active' : 'is-inactive'}`}
            aria-hidden={mapMode !== '2d'}
          >
            <ProjectGraph2D active={mapMode === '2d'} relationshipMode={relationshipMode} />
          </div>
          <div
            className={`graph-canvas graph-canvas-layer ${mapMode === '3d' ? 'is-active' : 'is-inactive'}`}
            aria-hidden={mapMode !== '3d'}
          >
            <ProjectGraph active={mapMode === '3d'} relationshipMode={relationshipMode} />
          </div>

          {/* Bottom-left Interaction Legend */}
          <div className="graph-help">
            {constellation
              ? 'Click to inspect · Double-click project to focus'
              : mapMode === '2d'
              ? 'Click folder to preview 15 · Double-click for sub-map · Drag to pan'
              : 'Click folder to preview 15 · Double-click for sub-map · Drag orbit'}
          </div>

          {/* Bottom-right Precision Control Dock */}
          <div className="graph-toolbar">
            {canConstellation && (
              <div className="mode-toggle-segmented" role="radiogroup" aria-label="Scope Mode">
                <button
                  className={!constellationMode ? 'active' : ''}
                  role="radio"
                  aria-checked={!constellationMode}
                  onClick={() => setConstellationMode(false)}
                  title="Inspect single active project"
                >
                  Single
                </button>
                <button
                  className={constellationMode ? 'active' : ''}
                  role="radio"
                  aria-checked={constellationMode}
                  onClick={() => setConstellationMode(true)}
                  title="Visualize multiple projects in orbital constellation"
                >
                  <Orbit size={12} />
                  <span>Constellation</span>
                </button>
              </div>
            )}

            <button
              className="toolbar-btn"
              title="Fit map in view"
              aria-label="Fit map in view"
              onClick={() => triggerMapAction('fit')}
            >
              <Compass size={15} />
            </button>

            <button
              className="toolbar-btn"
              title={selectedNodeId ? 'Focus camera on selected node' : 'Select a node to focus'}
              aria-label="Focus camera on selected node"
              disabled={!selectedNodeId}
              onClick={() => triggerMapAction('focus')}
            >
              <Crosshair size={15} />
            </button>

            <button
              className="toolbar-btn"
              title="Reset camera view"
              aria-label="Reset camera view"
              onClick={() => triggerMapAction('reset')}
            >
              <RotateCcw size={14} />
            </button>

            <div className="mode-toggle-segmented" role="radiogroup" aria-label="Map View Mode">
              <button
                className={mapMode === '2d' ? 'active' : ''}
                role="radio"
                aria-checked={mapMode === '2d'}
                onClick={() => setMapMode('2d')}
              >
                2D
              </button>
              <button
                className={mapMode === '3d' ? 'active' : ''}
                role="radio"
                aria-checked={mapMode === '3d'}
                onClick={() => setMapMode('3d')}
              >
                3D
              </button>
            </div>

            {fullscreenAvailable && (
              <button
                className="toolbar-btn"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
                onClick={() => void toggleFullscreen()}
              >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}
          </div>

          <FileViewer />
        </div>
      </section>
      <Inspector />
    </main>
  );
}
