import { useRef, useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Compass,
  Crosshair,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import { Inspector } from './Inspector';
import { ProjectGraph } from './ProjectGraph';
import { ProjectGraph2D } from './ProjectGraph2D';
import { WorkspaceTabs } from './WorkspaceTabs';
import { FileViewer } from './FileViewer';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';
import { computeGraphViewport } from '../services/graphViewport';

export function GraphPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(true);

  const project = useAppStore((s) => s.project);
  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);
  const relationshipMode = useAppStore((s) => s.relationshipMode);
  const setRelationshipMode = useAppStore((s) => s.setRelationshipMode);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const mapFocusNodeId = useAppStore((s) => s.mapFocusNodeId);
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

  // Keyboard navigation on map (Enter to explore/open, Escape to go up)
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
        if (useAppStore.getState().mapFocusNodeId !== 'root') {
          e.preventDefault();
          useAppStore.getState().navigateUpToParentFocus();
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

  // Viewport metrics and breadcrumbs
  const viewport = useMemo(() => {
    if (!project) return null;
    return computeGraphViewport({
      project,
      mapFocusNodeId,
      selectedNodeId,
      expandedNodeIds,
      relationshipMode,
    });
  }, [project, mapFocusNodeId, selectedNodeId, expandedNodeIds, relationshipMode]);

  return (
    <main className={`workspace ${isInspectorCollapsed ? 'inspector-collapsed' : ''}`}>
      <section className="workspace-main">
        <WorkspaceTabs />
        <div className="graph-stage" ref={stageRef}>
          {/* Top Filter Bar for Relationships */}
          <div className="map-filter-bar">
            <span className="filter-label">Filter:</span>
            <div className="filter-pill-group" role="tablist">
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

          {/* Breadcrumbs Navigation Bar */}
          {viewport && (
            <div className="map-breadcrumbs-bar">
              <div className="map-breadcrumbs-nav">
                {mapFocusNodeId !== 'root' && (
                  <button
                    className="map-back-btn"
                    onClick={() => navigateUpToParentFocus()}
                    title="Go up to parent directory (Esc)"
                    aria-label="Go up to parent directory"
                  >
                    <ArrowLeft size={13} />
                    <span>Back</span>
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

              <div className="map-status-info">
                <span>
                  {viewport.visibleNodes.length} nodes shown · {viewport.totalDirectChildren} direct children
                  {viewport.hiddenDirectChildren > 0 && ` (${viewport.hiddenDirectChildren} hidden)`}
                  {viewport.visibleDependenciesCount > 0 && ` · ${viewport.visibleDependenciesCount} deps`}
                </span>
              </div>
            </div>
          )}

          {/* Canvas Layers with isolated rendering and pointer events */}
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

          {/* Bottom Left Navigation Hint */}
          <div className="graph-help">
            {mapMode === '2d'
              ? 'Drag to pan · Scroll to zoom · Double-click folder to focus · Double-click file to open'
              : 'Drag to orbit · Right-drag to pan · Scroll to zoom · Double-click folder to focus · Double-click file to open'}
          </div>

          {/* Bottom Right Controls (Matching REFERENCE_ART/2D_APPROVED.png) */}
          <div className="graph-toolbar">
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
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
          </div>

          {/* Real File Viewer Modal */}
          <FileViewer />
        </div>
      </section>
      <Inspector />
    </main>
  );
}
