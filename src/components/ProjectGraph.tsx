import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PREFERENCES, type ProjectNode } from '../domain/models';
import { visibleGraphNodes } from '../services/layout';
import { loadPreferences } from '../storage/db';
import { useAppStore } from '../store/useAppStore';

const CLUSTER_COLORS = ['#6366F1', '#8B5CF6', '#10B981', '#EC4899', '#F59E0B', '#38BDF8'];

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
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

function GraphNode({ node, selected, color, showLabel, reducedEffects, onSelect }: { node: ProjectNode; selected: boolean; color: string; showLabel: boolean; reducedEffects: boolean; onSelect: () => void }) {
  const p = node.position ?? [0, 0, 0];
  const radius = node.kind === 'project' ? 0.78 : node.kind === 'directory' ? 0.46 : 0.2;
  const nodeColor = node.kind === 'project' ? '#8B5CF6' : color;
  return <group position={p}>
    <mesh onClick={(event) => { event.stopPropagation(); onSelect(); }} scale={selected ? 1.22 : 1}>
      <sphereGeometry args={[radius, reducedEffects ? 10 : node.kind === 'file' ? 14 : 24, reducedEffects ? 10 : node.kind === 'file' ? 14 : 24]} />
      <meshStandardMaterial color={nodeColor} emissive={nodeColor} emissiveIntensity={reducedEffects ? (selected ? .55 : .08) : (selected ? 1.05 : .22)} roughness={0.42} metalness={0.12} />
    </mesh>
    {showLabel && <Html center distanceFactor={9} position={[0, radius + .45, 0]}>
      <button className={`graph-label ${selected ? 'selected' : ''}`} onClick={onSelect}><b>{node.name}</b><span>{node.kind === 'project' ? 'project root' : node.kind}</span></button>
    </Html>}
  </group>;
}

function Scene({ reducedEffects }: { reducedEffects: boolean }) {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const select = useAppStore((s) => s.selectNode);
  const nodes = useMemo(() => project ? visibleGraphNodes(project.nodes, selectedId) : [], [project, selectedId]);
  const allById = useMemo(() => new Map((project?.nodes ?? []).map((node) => [node.id, node])), [project]);
  const visibleById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (!project) return null;
  return <>
    <ambientLight intensity={reducedEffects ? 1 : 0.85} />
    <pointLight position={[5, 8, 4]} intensity={reducedEffects ? 10 : 34} color="#8B5CF6" />
    <pointLight position={[-6, 4, -4]} intensity={reducedEffects ? 6 : 18} color="#6366F1" />
    {nodes.map((node) => {
      if (!node.parentId || !visibleById.has(node.parentId)) return null;
      const parent = visibleById.get(node.parentId)!;
      return <Line key={`line-${node.id}`} points={[parent.position ?? [0,0,0], node.position ?? [0,0,0]]} color="#4F4B67" lineWidth={1} transparent opacity={0.48} />;
    })}
    {nodes.map((node) => {
      const cluster = topLevelAncestor(node, allById);
      const color = CLUSTER_COLORS[hash(cluster.path) % CLUSTER_COLORS.length];
      const showLabel = node.kind === 'project' || node.depth <= 1 || node.id === selectedId;
      return <GraphNode key={node.id} node={node} selected={node.id === selectedId} color={color} showLabel={showLabel} reducedEffects={reducedEffects} onSelect={() => select(node.id)} />;
    })}
    <OrbitControls makeDefault enableDamping={!reducedEffects} dampingFactor={reducedEffects ? 0 : 0.08} minDistance={4} maxDistance={32} />
  </>;
}

export function ProjectGraph() {
  const [reducedEffects, setReducedEffects] = useState(DEFAULT_PREFERENCES.reducedEffects);

  useEffect(() => {
    let active = true;
    void loadPreferences().then((preferences) => {
      if (active) setReducedEffects(preferences.reducedEffects);
    });
    return () => { active = false; };
  }, []);

  return <div className="graph-canvas"><Canvas dpr={reducedEffects ? 1 : [1, 2]} camera={{ position: [0, 8, 17], fov: 52 }} onPointerMissed={() => useAppStore.getState().selectNode(null)}><Scene reducedEffects={reducedEffects} /></Canvas></div>;
}
