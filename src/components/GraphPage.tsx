import { useRef, useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Inspector } from './Inspector';
import { ProjectGraph } from './ProjectGraph';
import { WorkspaceTabs } from './WorkspaceTabs';

export function GraphPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(true);

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

  return (
    <main className="workspace">
      <section className="workspace-main">
        <WorkspaceTabs />
        <div className="graph-stage" ref={stageRef}>
          <ProjectGraph />
          <div className="graph-help">Drag to orbit · Right-drag to pan · Scroll to zoom</div>
          <div className="graph-toolbar">
            <span>3D</span>
            {fullscreenAvailable && (
              <button
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen graph'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen graph'}
                onClick={() => void toggleFullscreen()}
              >
                {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            )}
          </div>
        </div>
      </section>
      <Inspector />
    </main>
  );
}
