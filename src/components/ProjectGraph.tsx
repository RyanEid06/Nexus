import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AlertTriangle, Layers } from 'lucide-react';
import { DEFAULT_PREFERENCES, type ProjectNode } from '../domain/models';
import { visibleGraphNodes } from '../services/layout';
import { loadPreferences } from '../storage/db';
import { useAppStore } from '../store/useAppStore';

const CLUSTER_COLORS = ['#6366F1', '#8B5CF6', '#10B981', '#EC4899', '#F59E0B', '#38BDF8'];

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  return result >>> 0;
}

function topLevelAncestor(node: ProjectNode, byId: Map<string, ProjectNode>): ProjectNode {
  let current = node;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || parent.kind === 'project') break;
    current = parent;
  }
  return current;
}

function GraphNode({
  node,
  selected,
  color,
  showLabel,
  reducedEffects,
  onSelect,
}: {
  node: ProjectNode;
  selected: boolean;
  color: string;
  showLabel: boolean;
  reducedEffects: boolean;
  onSelect: () => void;
}) {
  const p = node.position ?? [0, 0, 0];
  const radius = node.kind === 'project' ? 0.78 : node.kind === 'directory' ? 0.46 : 0.2;
  const nodeColor = node.kind === 'project' ? '#8B5CF6' : color;

  return (
    <group position={p}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        scale={selected ? 1.25 : 1}
      >
        <sphereGeometry
          args={[
            radius,
            reducedEffects ? 10 : node.kind === 'file' ? 14 : 24,
            reducedEffects ? 10 : node.kind === 'file' ? 14 : 24,
          ]}
        />
        <meshStandardMaterial
          color={nodeColor}
          emissive={nodeColor}
          emissiveIntensity={reducedEffects ? (selected ? 0.55 : 0.08) : selected ? 1.15 : 0.22}
          roughness={0.42}
          metalness={0.12}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={9} position={[0, radius + 0.45, 0]}>
          <button
            className={`graph-label ${selected ? 'selected' : ''}`}
            onClick={onSelect}
            aria-label={`${node.name} (${node.kind})`}
          >
            <b>{node.name}</b>
            <span>{node.kind === 'project' ? 'project root' : node.kind}</span>
          </button>
        </Html>
      )}
    </group>
  );
}

function CameraRig({
  selectedPos,
  reducedEffects,
}: {
  selectedPos: [number, number, number] | null;
  reducedEffects: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const targetVec = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (selectedPos) {
      targetVec.current.set(selectedPos[0], selectedPos[1], selectedPos[2]);
    } else {
      targetVec.current.set(0, 0, 0);
    }
  }, [selectedPos]);

  useFrame(() => {
    if (controlsRef.current) {
      if (reducedEffects) {
        controlsRef.current.target.copy(targetVec.current);
      } else {
        controlsRef.current.target.lerp(targetVec.current, 0.08);
      }
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!reducedEffects}
      dampingFactor={reducedEffects ? 0 : 0.08}
      minDistance={3}
      maxDistance={38}
    />
  );
}

function Scene({ reducedEffects }: { reducedEffects: boolean }) {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const select = useAppStore((s) => s.selectNode);

  const nodes = useMemo(
    () => (project ? visibleGraphNodes(project.nodes, selectedId) : []),
    [project, selectedId]
  );
  const allById = useMemo(
    () => new Map((project?.nodes ?? []).map((node) => [node.id, node])),
    [project]
  );
  const visibleById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const selectedNode = selectedId ? allById.get(selectedId) : null;
  const selectedPos = selectedNode?.position ?? null;

  if (!project) return null;

  return (
    <>
      <ambientLight intensity={reducedEffects ? 1 : 0.85} />
      <pointLight position={[5, 8, 4]} intensity={reducedEffects ? 10 : 34} color="#8B5CF6" />
      <pointLight position={[-6, 4, -4]} intensity={reducedEffects ? 6 : 18} color="#6366F1" />

      {/* Structural Hierarchy Edges */}
      {nodes.map((node) => {
        if (!node.parentId || !visibleById.has(node.parentId)) return null;
        const parent = visibleById.get(node.parentId)!;
        return (
          <Line
            key={`line-${node.id}`}
            points={[parent.position ?? [0, 0, 0], node.position ?? [0, 0, 0]]}
            color="#4F4B67"
            lineWidth={1}
            transparent
            opacity={0.48}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const cluster = topLevelAncestor(node, allById);
        const color = CLUSTER_COLORS[hash(cluster.path) % CLUSTER_COLORS.length];
        const showLabel = node.kind === 'project' || node.depth <= 1 || node.id === selectedId;
        return (
          <GraphNode
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            color={color}
            showLabel={showLabel}
            reducedEffects={reducedEffects}
            onSelect={() => select(node.id)}
          />
        );
      })}

      <CameraRig selectedPos={selectedPos} reducedEffects={reducedEffects} />
    </>
  );
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('WebGL rendering error caught by boundary:', error, errorInfo);
    this.props.onFallback();
  }
  render() {
    return this.props.children;
  }
}

export function ProjectGraph() {
  const [reducedEffects, setReducedEffects] = useState(DEFAULT_PREFERENCES.reducedEffects);
  const [hasWebGLError, setHasWebGLError] = useState(false);
  const setPage = useAppStore((s) => s.setPage);

  useEffect(() => {
    let active = true;
    void loadPreferences().then((preferences) => {
      if (active) setReducedEffects(preferences.reducedEffects);
    });
    return () => {
      active = false;
    };
  }, []);

  if (hasWebGLError) {
    return (
      <div className="webgl-fallback">
        <AlertTriangle size={36} className="text-amber-400" />
        <h2>3D Acceleration Unavailable</h2>
        <p>Hardware WebGL rendering could not be initialized or lost context in this browser tab.</p>
        <button className="primary" onClick={() => setPage('structure')}>
          <Layers size={14} /> Switch to Structure View
        </button>
      </div>
    );
  }

  return (
    <div className="graph-canvas">
      <WebGLErrorBoundary onFallback={() => setHasWebGLError(true)}>
        <Canvas
          dpr={reducedEffects ? 1 : [1, 2]}
          camera={{ position: [0, 8, 17], fov: 52 }}
          onPointerMissed={() => useAppStore.getState().selectNode(null)}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setHasWebGLError(true);
            });
          }}
        >
          <Scene reducedEffects={reducedEffects} />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
