import { useRef, useState, useEffect } from 'react';
import {
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

export function GraphPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(true);

  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);
  const relationshipMode = useAppStore((s) => s.relationshipMode);
  const setRelationshipMode = useAppStore((s) => s.setRelationshipMode);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);

  useEffect(() => {
    setFullscreenAvailable(typeof document !== 'undefined' && Boolean(document.fullscreenEnabled));

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
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
        detail: { action, nodeId: selectedNodeId },
      })
    );
  };

  return (
    <main className="workspace">
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

          {/* Active Graph Canvas (Persisted to preserve WebGL context & avoid React 19 unmount collisions) */}
          <div className={`graph-canvas transition-opacity duration-200 ${mapMode === '2d' ? 'opacity-100' : 'pointer-events-none opacity-0 invisible'}`}>
            <ProjectGraph2D relationshipMode={relationshipMode} />
          </div>
          <div className={`graph-canvas transition-opacity duration-200 ${mapMode === '3d' ? 'opacity-100' : 'pointer-events-none opacity-0 invisible'}`}>
            <ProjectGraph relationshipMode={relationshipMode} />
          </div>

          {/* Bottom Left Navigation Hint */}
          <div className="graph-help">
            {mapMode === '2d'
              ? 'Drag to pan · Scroll to zoom · Double-click file to open'
              : 'Drag to orbit · Right-drag to pan · Scroll to zoom · Double-click file to open'}
          </div>

          {/* Bottom Right Controls (Matching REFERENCE_ART/2D_APPROVED.png) */}
          <div className="graph-toolbar">
            <button
              className="toolbar-btn"
              title="Fit entire map in view"
              aria-label="Fit entire map in view"
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
