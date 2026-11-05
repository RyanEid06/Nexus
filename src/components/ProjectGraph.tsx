import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AlertTriangle, MapPin, Layers } from 'lucide-react';
import { DEFAULT_PREFERENCES, type ProjectNode } from '../domain/models';
import { visibleGraphNodes } from '../services/layout';
import { loadPreferences } from '../storage/db';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';
import { getDirectoryColor, CLUSTER_COLORS } from '../utils/fileTypes';

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
  isHovered,
  color,
  showLabel,
  reducedEffects,
  onSelect,
  onOpen,
  onPointerOver,
  onPointerOut,
}: {
  node: ProjectNode;
  selected: boolean;
  isHovered: boolean;
  color: string;
  showLabel: boolean;
  reducedEffects: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const p = node.position ?? [0, 0, 0];
  const isProject = node.kind === 'project';
  const isDirectory = node.kind === 'directory';

  const nodeColor = isProject ? '#8B5CF6' : color;

  return (
    <group
      position={p}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onPointerOut();
      }}
    >
      {isProject ? (
        // Project Core: Layered procedural obsidian/violet orb with orbital rim & ground halo
        <group
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          scale={selected ? 1.15 : isHovered ? 1.08 : 1}
        >
          {/* Inner dark violet core */}
          <mesh>
            <sphereGeometry args={[0.72, 32, 32]} />
            <meshStandardMaterial
              color="#3B0764"
              emissive="#6D28D9"
              emissiveIntensity={reducedEffects ? 0.4 : selected ? 1.4 : 0.65}
              roughness={0.25}
              metalness={0.4}
            />
          </mesh>
          {/* Outer luminous shell */}
          <mesh>
            <sphereGeometry args={[0.95, 32, 32]} />
            <meshStandardMaterial
              color="#8B5CF6"
              emissive="#8B5CF6"
              emissiveIntensity={reducedEffects ? 0.45 : selected ? 1.2 : 0.75}
              transparent
              opacity={0.35}
              roughness={0.1}
              metalness={0.8}
            />
          </mesh>
          {!reducedEffects && (
            <>
              {/* Equatorial illuminated rim */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.05, 1.25, 64]} />
                <meshBasicMaterial color="#C4B5FD" transparent opacity={0.65} side={THREE.DoubleSide} />
              </mesh>
              {/* Ground projection halo */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}>
                <ringGeometry args={[1.35, 1.75, 64]} />
                <meshBasicMaterial color="#7C3AED" transparent opacity={0.35} side={THREE.DoubleSide} />
              </mesh>
            </>
          )}
        </group>
      ) : isDirectory ? (
        // Directory Hub: Dimensional beveled platform hub with top obsidian inlay and perimeter color ring
        <group
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          scale={selected ? 1.22 : isHovered ? 1.12 : 1}
        >
          {/* Base beveled platform */}
          <mesh>
            <cylinderGeometry args={[0.55, 0.48, 0.22, 32]} />
            <meshStandardMaterial
              color={nodeColor}
              emissive={nodeColor}
              emissiveIntensity={reducedEffects ? (selected ? 0.6 : 0.15) : selected ? 1.3 : 0.35}
              roughness={0.35}
              metalness={0.3}
            />
          </mesh>
          {/* Dark obsidian top inlay face */}
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.44, 0.44, 0.04, 32]} />
            <meshStandardMaterial color="#0F101A" roughness={0.3} metalness={0.85} />
          </mesh>
          {/* Top illuminated border ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <ringGeometry args={[0.44, 0.52, 32]} />
            <meshBasicMaterial
              color={selected ? '#FFFFFF' : nodeColor}
              transparent
              opacity={selected ? 0.95 : 0.65}
              side={THREE.DoubleSide}
            />
          </mesh>
          {!reducedEffects && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, 0]}>
              <ringGeometry args={[0.56, 0.72, 32]} />
              <meshBasicMaterial color={nodeColor} transparent opacity={selected ? 0.6 : 0.35} side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      ) : (
        // File Marker: Faceted octahedron gem with metallic sheen
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          scale={selected ? 1.45 : isHovered ? 1.25 : 1}
        >
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial
            color={nodeColor}
            emissive={nodeColor}
            emissiveIntensity={reducedEffects ? (selected ? 0.8 : 0.15) : selected ? 1.4 : isHovered ? 0.7 : 0.35}
            roughness={0.25}
            metalness={0.4}
          />
        </mesh>
      )}

      {showLabel && (
        <Html center distanceFactor={10} position={[0, isProject ? 1.4 : isDirectory ? 0.8 : 0.65, 0]}>
          <button
            className={`graph-label ${selected ? 'selected' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onOpen?.();
            }}
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
  visibleNodes,
  reducedEffects,
}: {
  selectedPos: [number, number, number] | null;
  visibleNodes: ProjectNode[];
  reducedEffects: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetCamPos = useRef(new THREE.Vector3(0, 8, 17));
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (selectedPos) {
      targetLookAt.current.set(selectedPos[0], selectedPos[1], selectedPos[2]);
    } else {
      targetLookAt.current.set(0, 0, 0);
    }
  }, [selectedPos]);

  useFrame(() => {
    if (!controlsRef.current) return;

    if (isTransitioning.current) {
      if (reducedEffects) {
        controlsRef.current.target.copy(targetLookAt.current);
        controlsRef.current.object.position.copy(targetCamPos.current);
        isTransitioning.current = false;
      } else {
        controlsRef.current.target.lerp(targetLookAt.current, 0.08);
        controlsRef.current.object.position.lerp(targetCamPos.current, 0.08);

        const targetDist = controlsRef.current.target.distanceTo(targetLookAt.current);
        const camDist = controlsRef.current.object.position.distanceTo(targetCamPos.current);
        if (targetDist < 0.02 && camDist < 0.05) {
          isTransitioning.current = false;
        }
      }
      controlsRef.current.update();
    } else {
      // Normal smooth tracking to target if needed
      if (reducedEffects) {
        controlsRef.current.target.copy(targetLookAt.current);
      } else {
        controlsRef.current.target.lerp(targetLookAt.current, 0.08);
      }
      controlsRef.current.update();
    }
  });

  useEffect(() => {
    const handle3DAction = (e: CustomEvent<{ action: string; nodeId?: string }>) => {
      if (!controlsRef.current) return;

      if (e.detail.action === 'reset') {
        targetLookAt.current.set(0, 0, 0);
        targetCamPos.current.set(0, 8, 17);
        isTransitioning.current = true;
      } else if (e.detail.action === 'focus') {
        // Center on selected node if available
        if (selectedPos) {
          targetLookAt.current.set(selectedPos[0], selectedPos[1], selectedPos[2]);
          targetCamPos.current.set(selectedPos[0] + 3.2, selectedPos[1] + 3.8, selectedPos[2] + 5.2);
          isTransitioning.current = true;
        }
      } else if (e.detail.action === 'fit') {
        // Calculate bounding box of all visible nodes
        if (visibleNodes.length > 0) {
          const box = new THREE.Box3();
          for (const n of visibleNodes) {
            if (n.position) {
              box.expandByPoint(new THREE.Vector3(...n.position));
            }
          }
          if (!box.isEmpty()) {
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z, 6);
            const fov = (controlsRef.current.object as THREE.PerspectiveCamera)?.fov || 52;
            const dist = Math.max(8, (maxDim / 2) / Math.tan((fov * Math.PI) / 360) * 1.35);

            targetLookAt.current.copy(center);
            targetCamPos.current.set(center.x, center.y + dist * 0.45, center.z + dist * 0.85);
            isTransitioning.current = true;
          }
        }
      }
    };

    window.addEventListener('nexus:map-action' as any, handle3DAction as any);
    return () => window.removeEventListener('nexus:map-action' as any, handle3DAction as any);
  }, [selectedPos, visibleNodes]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!reducedEffects}
      dampingFactor={reducedEffects ? 0 : 0.08}
      minDistance={2}
      maxDistance={65}
      onStart={() => {
        isTransitioning.current = false;
      }}
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  // Curved Dependency edges for 3D
  const depEdges3D = useMemo(() => {
    if (!showDependencies || !project?.dependencies?.edges) return [];
    const pathToNode = new Map<string, ProjectNode>();
    for (const n of project.nodes) {
      pathToNode.set(n.path, n);
    }

    const curves: Array<{ id: string; points: Array<[number, number, number]> }> = [];
    for (const edge of project.dependencies.edges) {
      if (!edge.isExternal && edge.isResolved) {
        const sNode = pathToNode.get(edge.sourcePath);
        const tNode = pathToNode.get(edge.targetResolvedPath ?? edge.targetPath);
        if (sNode && tNode && sNode.id !== tNode.id) {
          const p1 = sNode.position;
          const p2 = tNode.position;
          if (p1 && p2 && visibleById.has(sNode.id) && visibleById.has(tNode.id)) {
            // Quadratic Bezier arching upward
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;
            const midZ = (p1[2] + p2[2]) / 2;
            const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
            const archY = midY + Math.min(dist * 0.35, 3.5);

            const curve = new THREE.QuadraticBezierCurve3(
              new THREE.Vector3(...p1),
              new THREE.Vector3(midX, archY, midZ),
              new THREE.Vector3(...p2)
            );
            const points = curve.getPoints(20).map((pt) => [pt.x, pt.y, pt.z] as [number, number, number]);
            curves.push({ id: edge.id, points });
          }
        }
      }
    }
    return curves;
  }, [showDependencies, project, visibleById]);

  if (!project) return null;

  return (
    <>
      {/* Dynamic Starfield Background */}
      <Stars radius={65} depth={45} count={reducedEffects ? 400 : 1200} factor={2.5} saturation={0} fade speed={0} />

      {/* Multi-point Studio Lighting Rig */}
      <ambientLight intensity={reducedEffects ? 0.9 : 0.7} color="#251A45" />
      <directionalLight position={[14, 22, 14]} intensity={reducedEffects ? 1.0 : 1.5} color="#EDE9FE" />
      <directionalLight position={[-16, 12, -12]} intensity={reducedEffects ? 0.6 : 0.9} color="#38BDF8" />
      <pointLight position={[0, 0.5, 0]} intensity={reducedEffects ? 12 : 25} distance={35} color="#8B5CF6" />
      <pointLight position={[-6, -3, -6]} intensity={reducedEffects ? 8 : 15} distance={30} color="#6366F1" />

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
              color={isSelectedBranch ? '#A78BFA' : '#474563'}
              lineWidth={isSelectedBranch ? 2 : 1.2}
              transparent
              opacity={isSelectedBranch ? 0.95 : 0.45}
            />
          );
        })}

      {/* Curved Dependency Relationship Edges in 3D */}
      {showDependencies &&
        depEdges3D.map((dep) => (
          <Line
            key={`dep-3d-${dep.id}`}
            points={dep.points}
            color="#EC4899"
            lineWidth={1.4}
            dashed
            dashScale={1.5}
            dashSize={0.4}
            gapSize={0.3}
            transparent
            opacity={0.7}
          />
        ))}

      {/* 3D Nodes */}
      {nodes.map((node) => {
        const cluster = topLevelAncestor(node, allById);
        const color =
          node.kind === 'directory'
            ? getDirectoryColor(node.name)
            : CLUSTER_COLORS[hash(cluster.path) % CLUSTER_COLORS.length];
        const showLabel =
          node.kind === 'project' ||
          node.depth <= 1 ||
          node.id === selectedId ||
          node.id === hoveredId;

        return (
          <GraphNode3D
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            isHovered={node.id === hoveredId}
            color={color}
            showLabel={showLabel}
            reducedEffects={reducedEffects}
            onSelect={() => select(node.id)}
            onOpen={node.kind === 'file' ? () => openFileViewer(node.id) : undefined}
            onPointerOver={() => setHoveredId(node.id)}
            onPointerOut={() => setHoveredId(null)}
          />
        );
      })}

      <CameraRig selectedPos={selectedPos} visibleNodes={nodes} reducedEffects={reducedEffects} />
    </>
  );
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  return result >>> 0;
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
          onPointerMissed={(e) => {
            if (!e || (e.target as HTMLElement)?.tagName === 'CANVAS') {
              useAppStore.getState().selectNode(null);
            }
          }}
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
