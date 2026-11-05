import type { ProjectNode } from '../domain/models';

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Computes deterministic 3D coordinates for all project nodes.
 * Preserves the circular staircase / spiral hierarchy:
 * - Deterministic parent-relative placement
 * - Golden-angle angular distribution
 * - Depth-aware radius and vertical lift offsets
 * - Adaptive sibling spacing and deterministic collision relaxation
 */
export function withDeterministicLayout(nodes: ProjectNode[]): ProjectNode[] {
  const byParent = new Map<string | null, ProjectNode[]>();
  nodes.forEach((node) => {
    const group = byParent.get(node.parentId) ?? [];
    group.push(node);
    byParent.set(node.parentId, group);
  });

  const positioned = new Map<string, [number, number, number]>();
  const roots = byParent.get(null) ?? [];
  roots.forEach((root, index) => positioned.set(root.id, [index * 3, 0, 0]));

  const walk = (parentId: string, depth: number) => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const parent = positioned.get(parentId) ?? [0, 0, 0];
    const baseRadius = Math.max(2.4, 5.4 - depth * 0.7);
    const radius = baseRadius * (1 + Math.min(children.length, 30) * 0.025);

    children.forEach((child, index) => {
      const angle = index * GOLDEN_ANGLE + depth * 0.7;
      const lift = depth * -0.45 + ((index % 3) - 1) * 0.22;
      const next: [number, number, number] = [
        parent[0] + Math.cos(angle) * radius,
        parent[1] + lift,
        parent[2] + Math.sin(angle) * radius,
      ];
      positioned.set(child.id, next);
      walk(child.id, depth + 1);
    });
  };

  roots.forEach((root) => walk(root.id, 1));

  // Deterministic collision avoidance relaxation pass for siblings/neighbors
  // Ensures nodes at similar heights do not directly penetrate each other
  const minSeparation = 1.1;
  const allIds = Array.from(positioned.keys());
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < allIds.length; i += 1) {
      const idA = allIds[i];
      const posA = positioned.get(idA)!;
      for (let j = i + 1; j < allIds.length; j += 1) {
        const idB = allIds[j];
        const posB = positioned.get(idB)!;

        const dx = posB[0] - posA[0];
        const dy = posB[1] - posA[1];
        const dz = posB[2] - posA[2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < minSeparation * minSeparation && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minSeparation - dist) * 0.35;
          const nx = (dx / dist) * overlap;
          const nz = (dz / dist) * overlap;

          // Only adjust non-root nodes
          const nodeA = nodes.find((n) => n.id === idA);
          const nodeB = nodes.find((n) => n.id === idB);

          if (nodeA?.parentId) {
            posA[0] -= nx;
            posA[2] -= nz;
          }
          if (nodeB?.parentId) {
            posB[0] += nx;
            posB[2] += nz;
          }
        }
      }
    }
  }

  return nodes.map((node) => {
    const p = positioned.get(node.id) ?? [0, 0, 0];
    // Safeguard against NaN/Infinity
    const cleanPos: [number, number, number] = [
      Number.isFinite(p[0]) ? p[0] : 0,
      Number.isFinite(p[1]) ? p[1] : 0,
      Number.isFinite(p[2]) ? p[2] : 0,
    ];
    return { ...node, position: cleanPos };
  });
}

export interface Node2DPosition {
  x: number;
  y: number;
  angle: number;
}

/**
 * Computes deterministic 2D positions replicating REFERENCE_ART/2D_APPROVED.png:
 * - Central circular project root node at (0, 0)
 * - Radial distribution of top-level directories around root
 * - Children fan outward away from parent in an expanding arc
 * - Stable positions, zero random jitter
 */
export function calculate2DLayout(
  nodes: ProjectNode[],
  expandedIds: Set<string>,
  rootId?: string
): Map<string, Node2DPosition> {
  const result = new Map<string, Node2DPosition>();
  const byParent = new Map<string | null, ProjectNode[]>();

  nodes.forEach((node) => {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  });

  const root = nodes.find((n) => n.id === rootId) ?? nodes.find((n) => n.kind === 'project') ?? nodes[0];
  if (!root) return result;

  // Root at center
  result.set(root.id, { x: 0, y: 0, angle: 0 });

  // Top level directories (depth 1)
  const topLevel = (byParent.get(root.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const topCount = topLevel.length;
  const baseRadius = topCount <= 6 ? 260 : topCount <= 10 ? 300 : 340;

  topLevel.forEach((dir, i) => {
    // Distribute evenly around the circle, starting from top (angle -PI/2)
    const angle = (i / Math.max(1, topCount)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * baseRadius;
    const y = Math.sin(angle) * baseRadius;
    result.set(dir.id, { x, y, angle });

    // If expanded, fan out children
    if (expandedIds.has(dir.id)) {
      layoutChildren2D(dir.id, x, y, angle, 1, byParent, expandedIds, result);
    }
  });

  return result;
}

function layoutChildren2D(
  parentId: string,
  parentX: number,
  parentY: number,
  parentAngle: number,
  depth: number,
  byParent: Map<string | null, ProjectNode[]>,
  expandedIds: Set<string>,
  result: Map<string, Node2DPosition>
) {
  const children = (byParent.get(parentId) ?? []).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!children.length) return;

  const count = children.length;
  const radialDistance = 145 + depth * 15;
  // Arc spread depending on child count
  const maxSpread = Math.min(Math.PI * 0.75, Math.max(0.45, count * 0.18));

  children.forEach((child, idx) => {
    let offsetAngle = 0;
    if (count > 1) {
      const step = maxSpread / (count - 1);
      offsetAngle = -maxSpread / 2 + idx * step;
    }
    const angle = parentAngle + offsetAngle;
    const x = parentX + Math.cos(angle) * radialDistance;
    const y = parentY + Math.sin(angle) * radialDistance;

    result.set(child.id, { x, y, angle });

    if (child.kind === 'directory' && expandedIds.has(child.id)) {
      layoutChildren2D(child.id, x, y, angle, depth + 1, byParent, expandedIds, result);
    }
  });
}

function ancestorIds(nodes: ProjectNode[], node: ProjectNode): string[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const ids: string[] = [];
  let current: ProjectNode | undefined = node;
  while (current) {
    ids.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return ids;
}

export function visibleGraphNodes(
  nodes: ProjectNode[],
  selectedId: string | null,
  expandedIds?: Set<string>,
  maxNodes = 200
): ProjectNode[] {
  // Always include project root and top-level directories
  const base = nodes.filter((node) => node.depth <= 1);
  const merged = new Map(base.map((node) => [node.id, node]));

  // Include children of expanded branches
  if (expandedIds && expandedIds.size > 0) {
    for (const node of nodes) {
      if (node.parentId && expandedIds.has(node.parentId)) {
        merged.set(node.id, node);
      }
    }
  }

  // Include selected node and its ancestry / direct descendants
  if (selectedId) {
    const selected = nodes.find((node) => node.id === selectedId);
    if (selected) {
      const ids = new Set(ancestorIds(nodes, selected));
      for (const node of nodes) {
        if (ids.has(node.id) || node.parentId === selected.id) {
          merged.set(node.id, node);
        }
      }
      const parent = selected.parentId ? nodes.find((node) => node.id === selected.parentId) : undefined;
      if (parent) {
        for (const sibling of nodes.filter((node) => node.parentId === parent.id)) {
          merged.set(sibling.id, sibling);
        }
      }
    }
  }

  // If still below capacity, fill with depth 2 nodes up to maxNodes
  if (merged.size < maxNodes) {
    for (const node of nodes.filter((item) => item.depth === 2)) {
      if (merged.size >= maxNodes) break;
      merged.set(node.id, node);
    }
  }

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : undefined;
  const mustKeep = new Set(selectedNode ? ancestorIds(nodes, selectedNode) : []);
  if (nodes[0]) mustKeep.add(nodes[0].id);

  const ordered = [...merged.values()].sort((a, b) => {
    const aMust = mustKeep.has(a.id) ? 1 : 0;
    const bMust = mustKeep.has(b.id) ? 1 : 0;
    if (aMust !== bMust) return bMust - aMust;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.name.localeCompare(b.name);
  });

  return ordered.slice(0, maxNodes);
}

