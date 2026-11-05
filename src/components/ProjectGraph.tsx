import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AlertTriangle, MapPin, Layers } from 'lucide-react';
import { DEFAULT_PREFERENCES, type ProjectNode } from '../domain/models';
import { visibleGraphNodes } from '../services/layout';
import { loadPreferences } from '../storage/db';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';

const CLUSTER_COLORS = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#38BDF8', // Sky
  '#84CC16', // Lime
];

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

function GraphNode3D({
  node,
  selected,
  color,
  showLabel,
  reducedEffects,
  onSelect,
  onOpen,
}: {
  node: ProjectNode;
  selected: boolean;
  color: string;
  showLabel: boolean;
  reducedEffects: boolean;
  onSelect: () => void;
  onOpen?: () => void;
}) {
  const p = node.position ?? [0, 0, 0];
  const isProject = node.kind === 'project';
  const isDirectory = node.kind === 'directory';

  // Node sizing
  const radius = isProject ? 0.85 : isDirectory ? 0.48 : 0.22;
  const nodeColor = isProject ? '#8B5CF6' : color;

  return (
    <group position={p}>
      {isProject ? (
        // Project Core: Spherical hub with outer atmospheric glow ring
        <group>
          <mesh
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            scale={selected ? 1.2 : 1}
          >
            <sphereGeometry args={[radius, 32, 32]} />
            <meshStandardMaterial
              color="#7C3AED"
              emissive="#8B5CF6"
              emissiveIntensity={reducedEffects ? 0.4 : selected ? 1.4 : 0.55}
              roughness={0.25}
              metalness={0.3}
            />
          </mesh>
          {!reducedEffects && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius * 1.15, radius * 1.25, 48]} />
              <meshBasicMaterial color="#A78BFA" transparent opacity={0.45} side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      ) : isDirectory ? (
        // Directory Hub: Cylindrical / beveled platform hub
        <group>
          <mesh
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            scale={selected ? 1.25 : 1}
          >
            <cylinderGeometry args={[radius, radius * 0.9, 0.28, 24]} />
            <meshStandardMaterial
              color={nodeColor}
              emissive={nodeColor}
              emissiveIntensity={reducedEffects ? (selected ? 0.6 : 0.15) : selected ? 1.2 : 0.35}
              roughness={0.35}
              metalness={0.25}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
            <ringGeometry args={[radius * 0.85, radius * 0.95, 24]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={selected ? 0.8 : 0.35} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ) : (
        // File Marker: Compact luminous sphere with double-click to open
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          scale={selected ? 1.4 : 1}
        >
          <sphereGeometry args={[radius, reducedEffects ? 10 : 16, reducedEffects ? 10 : 16]} />
          <meshStandardMaterial
            color={nodeColor}
            emissive={nodeColor}
            emissiveIntensity={reducedEffects ? (selected ? 0.7 : 0.1) : selected ? 1.3 : 0.3}
            roughness={0.45}
            metalness={0.15}
          />
        </mesh>
      )}

      {showLabel && (
        <Html center distanceFactor={10} position={[0, radius + 0.5, 0]}>
          <button
            className={`graph-label ${selected ? 'selected' : ''}`}
            onClick={onSelect}
            onDoubleClick={onOpen}
            aria-label={`${node.name} (${node.kind})`}
          >
            <b>{node.name}</b>
            <span>
              {isProject
                ? 'project root'
                : isDirectory
                ? `${node.descendantFiles ?? 0} files`
                : `${node.loc} loc`}
            </span>
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

  useEffect(() => {
    const handle3DAction = (e: CustomEvent<{ action: string; nodeId?: string }>) => {
      if (!controlsRef.current) return;
      if (e.detail.action === 'reset') {
        controlsRef.current.reset();
        targetVec.current.set(0, 0, 0);
      } else if (e.detail.action === 'fit') {
        targetVec.current.set(0, 0, 0);
        controlsRef.current.object.position.set(0, 10, 20);
      }
    };
    window.addEventListener('nexus:map-action' as any, handle3DAction as any);
    return () => window.removeEventListener('nexus:map-action' as any, handle3DAction as any);
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!reducedEffects}
      dampingFactor={reducedEffects ? 0 : 0.08}
      minDistance={2}
      maxDistance={45}
    />
  );
}

function Scene({
  reducedEffects,
  relationshipMode,
}: {
  reducedEffects: boolean;
  relationshipMode: RelationshipFilterMode;
}) {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const select = useAppStore((s) => s.selectNode);
  const openFileViewer = useAppStore((s) => s.openFileViewer);
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);

  const nodes = useMemo(
    () => (project ? visibleGraphNodes(project.nodes, selectedId, expandedNodeIds) : []),
    [project, selectedId, expandedNodeIds]
  );
  const allById = useMemo(
    () => new Map((project?.nodes ?? []).map((node) => [node.id, node])),
    [project]
  );
  const visibleById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const selectedNode = selectedId ? allById.get(selectedId) : null;
  const selectedPos = selectedNode?.position ?? null;

  const showHierarchy = relationshipMode === 'hierarchy' || relationshipMode === 'both';
  const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';

  // Dependency edges for 3D
  const depEdges3D = useMemo(() => {
    if (!showDependencies || !project?.dependencies?.edges) return [];
    const pathToNode = new Map<string, ProjectNode>();
    for (const n of project.nodes) {
      pathToNode.set(n.path, n);
    }

    const lines: Array<{ id: string; p1: [number, number, number]; p2: [number, number, number] }> = [];
    for (const edge of project.dependencies.edges) {
      if (!edge.isExternal && edge.isResolved) {
        const sNode = pathToNode.get(edge.sourcePath);
        const tNode = pathToNode.get(edge.targetResolvedPath ?? edge.targetPath);
        if (sNode && tNode && sNode.id !== tNode.id) {
          const p1 = sNode.position;
          const p2 = tNode.position;
          if (p1 && p2 && visibleById.has(sNode.id) && visibleById.has(tNode.id)) {
            lines.push({ id: edge.id, p1, p2 });
          }
        }
      }
    }
    return lines;
  }, [showDependencies, project, visibleById]);

  if (!project) return null;

  return (
    <>
      <ambientLight intensity={reducedEffects ? 1 : 0.85} />
      <directionalLight position={[10, 15, 10]} intensity={reducedEffects ? 0.7 : 1.2} />
      <pointLight position={[5, 8, 4]} intensity={reducedEffects ? 10 : 32} color="#8B5CF6" />
      <pointLight position={[-6, 4, -4]} intensity={reducedEffects ? 6 : 16} color="#6366F1" />

      {/* Structural Hierarchy Edges */}
      {showHierarchy &&
        nodes.map((node) => {
          if (!node.parentId || !visibleById.has(node.parentId)) return null;
          const parent = visibleById.get(node.parentId)!;
          const isSelectedBranch = selectedId === node.id || selectedId === parent.id;
          return (
            <Line
              key={`line-${node.id}`}
              points={[parent.position ?? [0, 0, 0], node.position ?? [0, 0, 0]]}
              color={isSelectedBranch ? '#A78BFA' : '#4F4B67'}
              lineWidth={isSelectedBranch ? 1.8 : 1}
              transparent
              opacity={isSelectedBranch ? 0.9 : 0.45}
            />
          );
        })}

      {/* Dependency Relationship Edges in 3D */}
      {showDependencies &&
        depEdges3D.map((dep) => (
          <Line
            key={`dep-3d-${dep.id}`}
            points={[dep.p1, dep.p2]}
            color="#EC4899"
            lineWidth={1.2}
            dashed
            dashScale={2}
            dashSize={0.6}
            gapSize={0.4}
            transparent
            opacity={0.65}
          />
        ))}

      {/* 3D Nodes */}
      {nodes.map((node) => {
        const cluster = topLevelAncestor(node, allById);
        const color = CLUSTER_COLORS[hash(cluster.path) % CLUSTER_COLORS.length];
        const showLabel = node.kind === 'project' || node.depth <= 1 || node.id === selectedId;
        return (
          <GraphNode3D
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            color={color}
            showLabel={showLabel}
            reducedEffects={reducedEffects}
            onSelect={() => select(node.id)}
            onOpen={node.kind === 'file' ? () => openFileViewer(node.id) : undefined}
          />
        );
      })}

      <CameraRig selectedPos={selectedPos} reducedEffects={reducedEffects} />
    </>
  );
}

// Fixed WebGL Error Boundary (P1.3): renders clean fallback UI instead of crashing or returning broken children
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
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export function ProjectGraph({
  relationshipMode = 'hierarchy',
}: {
  relationshipMode?: RelationshipFilterMode;
}) {
  const [reducedEffects, setReducedEffects] = useState(DEFAULT_PREFERENCES.reducedEffects);
  const [hasWebGLError, setHasWebGLError] = useState(false);
  const setPage = useAppStore((s) => s.setPage);
  const setMapMode = useAppStore((s) => s.setMapMode);

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
        <p>Hardware WebGL rendering could not be initialized or lost context in this browser environment.</p>
        <div className="fallback-actions">
          <button className="primary" onClick={() => setMapMode('2d')}>
            <MapPin size={15} /> Switch to 2D Map
          </button>
          <button className="ghost" onClick={() => setPage('structure')}>
            <Layers size={15} /> Switch to Structure View
          </button>
        </div>
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
          <Scene reducedEffects={reducedEffects} relationshipMode={relationshipMode} />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
