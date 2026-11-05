import { Maximize2 } from 'lucide-react';
import { useRef } from 'react';
import { Inspector } from './Inspector';
import { ProjectGraph } from './ProjectGraph';
import { WorkspaceTabs } from './WorkspaceTabs';

export function GraphPage() {
  const stageRef = useRef<HTMLDivElement>(null);

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  }

  return <main className="workspace">
    <section className="workspace-main">
      <WorkspaceTabs/>
      <div className="graph-stage" ref={stageRef}><ProjectGraph/><div className="graph-help">Drag to orbit · Right-drag to pan · Scroll to zoom</div><div className="graph-toolbar"><span>3D</span><button title="Fullscreen graph" onClick={() => void toggleFullscreen()}><Maximize2 size={17}/></button></div></div>
    </section>
    <Inspector/>
  </main>;
}
