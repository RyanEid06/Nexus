import type { ProjectIndex, ProjectNode } from '../domain/models';
import { CLUSTER_COLORS, getDirectoryColor } from '../utils/fileTypes';

export interface ConstellationProjectSummary {
  projectId: string;
  name: string;
  source: 'demo' | 'local';
  files: number;
  folders: number;
  totalLoc: number;
  indexedBytes: number;
  dependencyEdges: number;
  circularCycles: number;
  externalPackages: string[];
  couplingRatio: number; // edges per file
  dominantLanguage: string;
  accentColor: string;
  center2D: { x: number; y: number };
  radius2D: number;
  center3D: [number, number, number];
  radius3D: number;
}

export interface ConstellationNode2D {
  id: string;
  projectId: string;
  sourceNode: ProjectNode;
  kind: 'project' | 'directory' | 'file';
  label: string;
  subtitle: string;
  color: string;
  x: number;
  y: number;
  pos3D: [number, number, number];
  parentConstellationId: string | null;
}

export interface ConstellationPackageBridge {
  packageName: string;
  projectIds: string[];
  x: number;
  y: number;
  pos3D: [number, number, number];
  usageCount: number;
}

export interface ConstellationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: 'hierarchy' | 'bridge';
  color: string;
}

export interface ConstellationLayoutModel {
  projects: ConstellationProjectSummary[];
  nodes: ConstellationNode2D[];
  nodeById: Map<string, ConstellationNode2D>;
  edges: ConstellationEdge[];
  bridges: ConstellationPackageBridge[];
  sharedPackages: Array<{ name: string; projectNames: string[]; projectIds: string[] }>;
  totals: {
    projects: number;
    files: number;
    totalLoc: number;
    dependencyEdges: number;
    circularCycles: number;
    sharedPackagesCount: number;
  };
}

const PROJECT_SYSTEM_ACCENTS = ['#22D3EE', '#38BDF8', '#10B981', '#F59E0B', '#A78BFA', '#FB7185'];

/**
 * Computes a deterministic multi-project 2D & 3D constellation layout.
 * Places each selected project in its own non-overlapping orbital subsystem,
 * surfaces top-level directories, and bridges shared external dependencies across projects.
 */
export function computeMultiProjectConstellation(
  projects: ProjectIndex[]
): ConstellationLayoutModel {
  const ordered = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  const count = ordered.length;

  const summaries: ConstellationProjectSummary[] = [];
  const nodes: ConstellationNode2D[] = [];
  const nodeById = new Map<string, ConstellationNode2D>();
  const edges: ConstellationEdge[] = [];
  const bridges: ConstellationPackageBridge[] = [];

  if (count === 0) {
    return {
      projects: [],
      nodes: [],
      nodeById,
      edges: [],
      bridges: [],
      sharedPackages: [],
      totals: {
        projects: 0,
        files: 0,
        totalLoc: 0,
        dependencyEdges: 0,
        circularCycles: 0,
        sharedPackagesCount: 0,
      },
    };
  }

  // Compute outer orbital ring radius so adjacent project clusters never intersect
  const clusterRadius2D = 185;
  const minCenterSeparation2D = clusterRadius2D * 2 + 120;
  const orbitRadius2D =
    count === 1
      ? 0
      : Math.max(290, minCenterSeparation2D / (2 * Math.sin(Math.PI / count)));

  const clusterRadius3D = 3.2;
  const orbitRadius3D =
    count === 1
      ? 0
      : Math.max(5.8, (clusterRadius3D * 2 + 2.4) / (2 * Math.sin(Math.PI / count)));

  // Collect shared external packages across >= 2 projects
  const packageToProjectIds = new Map<string, string[]>();
  for (const proj of ordered) {
    const pkgs = proj.dependencies?.externalPackages ?? [];
    for (const pkg of pkgs) {
      const list = packageToProjectIds.get(pkg) ?? [];
      if (!list.includes(proj.id)) {
        list.push(proj.id);
        packageToProjectIds.set(pkg, list);
      }
    }
  }

  const sharedPkgEntries = Array.from(packageToProjectIds.entries())
    .filter(([, pIds]) => pIds.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 8);

  const projectCenters2D = new Map<string, { x: number; y: number; color: string }>();
  const projectCenters3D = new Map<string, [number, number, number]>();

  ordered.forEach((proj, idx) => {
    const angle = count === 1 ? 0 : (idx / count) * Math.PI * 2 - Math.PI / 2;
    const cx2D = Math.cos(angle) * orbitRadius2D;
    const cy2D = Math.sin(angle) * orbitRadius2D;

    const cx3D = Math.cos(angle) * orbitRadius3D;
    const cz3D = Math.sin(angle) * orbitRadius3D;
    const cy3D = (idx % 2 === 0 ? 0.35 : -0.35);

    const accent = PROJECT_SYSTEM_ACCENTS[idx % PROJECT_SYSTEM_ACCENTS.length];
    projectCenters2D.set(proj.id, { x: cx2D, y: cy2D, color: accent });
    projectCenters3D.set(proj.id, [cx3D, cy3D, cz3D]);

    const files = proj.metrics.files;
    const depCount = proj.metrics.dependencyEdges ?? 0;
    const cycleCount = proj.metrics.circularDependenciesCount ?? proj.dependencies?.circularDependencies.length ?? 0;
    const dominantLanguage = proj.metrics.languages[0]?.language ?? 'Mixed';

    summaries.push({
      projectId: proj.id,
      name: proj.name,
      source: proj.source,
      files,
      folders: proj.metrics.folders,
      totalLoc: proj.metrics.totalLoc,
      indexedBytes: proj.metrics.indexedBytes,
      dependencyEdges: depCount,
      circularCycles: cycleCount,
      externalPackages: proj.dependencies?.externalPackages ?? [],
      couplingRatio: files > 0 ? Number((depCount / files).toFixed(2)) : 0,
      dominantLanguage,
      accentColor: accent,
      center2D: { x: cx2D, y: cy2D },
      radius2D: clusterRadius2D,
      center3D: [cx3D, cy3D, cz3D],
      radius3D: clusterRadius3D,
    });

    const rootNode = proj.nodes.find((n) => n.kind === 'project') ?? proj.nodes[0];
    if (!rootNode) return;

    const rootConstellationId = `${proj.id}::${rootNode.id}`;
    const rootCNode: ConstellationNode2D = {
      id: rootConstellationId,
      projectId: proj.id,
      sourceNode: rootNode,
      kind: 'project',
      label: proj.name,
      subtitle: `${files.toLocaleString()} files · ${proj.metrics.totalLoc.toLocaleString()} loc`,
      color: accent,
      x: cx2D,
      y: cy2D,
      pos3D: [cx3D, cy3D, cz3D],
      parentConstellationId: null,
    };
    nodes.push(rootConstellationId ? rootCNode : rootCNode);
    nodeById.set(rootConstellationId, rootCNode);

    // Top-level directories & root files sorted by significance (max 10 per orbital island)
    const directChildren = proj.nodes
      .filter((n) => n.parentId === rootNode.id)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return (b.descendantFiles ?? b.loc) - (a.descendantFiles ?? a.loc) || a.name.localeCompare(b.name);
      })
      .slice(0, 10);

    const childCount = directChildren.length;
    const subRadius2D = Math.min(clusterRadius2D - 34, Math.max(115, childCount * 16));
    const subRadius3D = Math.min(clusterRadius3D - 0.6, Math.max(1.9, Math.sqrt(Math.max(1, childCount)) * 0.95));

    directChildren.forEach((child, cIdx) => {
      const cAngle = (cIdx / Math.max(1, childCount)) * Math.PI * 2 + angle;
      const nx2D = cx2D + Math.cos(cAngle) * subRadius2D;
      const ny2D = cy2D + Math.sin(cAngle) * subRadius2D;
      const nx3D = cx3D + Math.cos(cAngle) * subRadius3D;
      const nz3D = cz3D + Math.sin(cAngle) * subRadius3D;
      const ny3D = cy3D - 0.45 - (cIdx % 3) * 0.16;

      const cId = `${proj.id}::${child.id}`;
      const nodeColor =
        child.kind === 'directory'
          ? getDirectoryColor(child.name)
          : CLUSTER_COLORS[cIdx % CLUSTER_COLORS.length];

      const childCNode: ConstellationNode2D = {
        id: cId,
        projectId: proj.id,
        sourceNode: child,
        kind: child.kind === 'directory' ? 'directory' : 'file',
        label: child.kind === 'directory' ? `${child.name}/` : child.name,
        subtitle:
          child.kind === 'directory'
            ? `${child.descendantFiles ?? 0} files`
            : `${child.loc} loc`,
        color: nodeColor,
        x: nx2D,
        y: ny2D,
        pos3D: [nx3D, ny3D, nz3D],
        parentConstellationId: rootConstellationId,
      };
      nodes.push(childCNode);
      nodeById.set(cId, childCNode);

      edges.push({
        id: `ch-${rootConstellationId}-${cId}`,
        sourceId: rootConstellationId,
        targetId: cId,
        kind: 'hierarchy',
        color: nodeColor,
      });
    });
  });

  // Position shared external package bridges near the barycenter of their consuming projects
  const sharedPackages: ConstellationLayoutModel['sharedPackages'] = [];
  sharedPkgEntries.forEach(([pkgName, pIds], bIdx) => {
    let sumX2 = 0;
    let sumY2 = 0;
    let sumX3 = 0;
    let sumY3 = 0;
    let sumZ3 = 0;
    const pNames: string[] = [];

    for (const pId of pIds) {
      const c2 = projectCenters2D.get(pId);
      const c3 = projectCenters3D.get(pId);
      const proj = ordered.find((p) => p.id === pId);
      if (proj) pNames.push(proj.name);
      if (c2) {
        sumX2 += c2.x;
        sumY2 += c2.y;
      }
      if (c3) {
        sumX3 += c3[0];
        sumY3 += c3[1];
        sumZ3 += c3[2];
      }
    }

    const n = Math.max(1, pIds.length);
    // Offset overlapping barycenters cleanly along a small inner ring
    const jitterAngle = (bIdx / Math.max(1, sharedPkgEntries.length)) * Math.PI * 2;
    const innerOffset = sharedPkgEntries.length > 1 ? 56 : 0;
    const bx2D = sumX2 / n + Math.cos(jitterAngle) * innerOffset;
    const by2D = sumY2 / n + Math.sin(jitterAngle) * innerOffset;
    const bx3D = sumX3 / n + Math.cos(jitterAngle) * 1.1;
    const by3D = sumY3 / n + 1.45;
    const bz3D = sumZ3 / n + Math.sin(jitterAngle) * 1.1;

    bridges.push({
      packageName: pkgName,
      projectIds: pIds,
      x: bx2D,
      y: by2D,
      pos3D: [bx3D, by3D, bz3D],
      usageCount: pIds.length,
    });

    sharedPackages.push({
      name: pkgName,
      projectIds: pIds,
      projectNames: pNames,
    });

    for (const pId of pIds) {
      const proj = ordered.find((p) => p.id === pId);
      const rootNode = proj?.nodes.find((nd) => nd.kind === 'project') ?? proj?.nodes[0];
      if (rootNode) {
        edges.push({
          id: `br-${pkgName}-${pId}`,
          sourceId: `${pId}::${rootNode.id}`,
          targetId: `pkg::${pkgName}`,
          kind: 'bridge',
          color: '#22D3EE',
        });
      }
    }
  });

  const totals = summaries.reduce(
    (acc, item) => ({
      projects: acc.projects + 1,
      files: acc.files + item.files,
      totalLoc: acc.totalLoc + item.totalLoc,
      dependencyEdges: acc.dependencyEdges + item.dependencyEdges,
      circularCycles: acc.circularCycles + item.circularCycles,
      sharedPackagesCount: sharedPackages.length,
    }),
    {
      projects: 0,
      files: 0,
      totalLoc: 0,
      dependencyEdges: 0,
      circularCycles: 0,
      sharedPackagesCount: sharedPackages.length,
    }
  );

  return {
    projects: summaries,
    nodes,
    nodeById,
    edges,
    bridges,
    sharedPackages,
    totals,
  };
}
