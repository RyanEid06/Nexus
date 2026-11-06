import type { ProjectNode } from '../domain/models';

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Computes deterministic 3D coordinates for all project nodes.
 * Preserves the circular staircase / spiral hierarchy:
 * - Deterministic parent-relative placement
 * - Golden-angle angular distribution
 * - Depth-aware radius and downward vertical spiral lift offsets
 * - Adaptive sibling spacing with O(N) spatial hash collision relaxation
 */
export function withDeterministicLayout(nodes: ProjectNode[]): ProjectNode[] {
  const byParent = new Map<string | null, ProjectNode[]>();
  const byId = new Map<string, ProjectNode>();

  for (const node of nodes) {
    byId.set(node.id, node);
    const group = byParent.get(node.parentId) ?? [];
    group.push(node);
    byParent.set(node.parentId, group);
  }

  const positioned = new Map<string, [number, number, number]>();
  const roots = (byParent.get(null) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach((root, index) => positioned.set(root.id, [index * 4, 0, 0]));

  const walk = (parentId: string, depth: number) => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const parent = positioned.get(parentId) ?? [0, 0, 0];
    const baseRadius = Math.max(2.6, 5.6 - depth * 0.6);
    // Radius expands smoothly with child count to provide natural sibling separation
    const radius = baseRadius * (1 + Math.sqrt(children.length) * 0.16);

    children.forEach((child, index) => {
      const angle = index * GOLDEN_ANGLE + depth * 0.7;
      // Monotonic vertical staircase: depth step + index spiral offset
      const lift = -(depth * 0.6 + index * 0.08);
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

  // O(N) Spatial Hash Grid collision relaxation pass
  // Replaces catastrophic O(N^2)/O(N^3) global pair comparisons
  const minSeparation = 1.1;
  const cellSize = minSeparation;
  const grid = new Map<string, string[]>();

  const getCellKey = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);
    return `${cx},${cy},${cz}`;
  };

  // Populate grid with non-root nodes
  for (const [id, pos] of positioned.entries()) {
    const node = byId.get(id);
    if (!node?.parentId) continue; // Keep roots anchored
    const key = getCellKey(pos[0], pos[1], pos[2]);
    const bucket = grid.get(key) ?? [];
    bucket.push(id);
    grid.set(key, bucket);
  }

  // Relaxation pass querying only immediate 27 neighboring cells (strictly O(N))
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [idA, posA] of positioned.entries()) {
      const nodeA = byId.get(idA);
      if (!nodeA?.parentId) continue;

      const cx = Math.floor(posA[0] / cellSize);
      const cy = Math.floor(posA[1] / cellSize);
      const cz = Math.floor(posA[2] / cellSize);

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const neighborKey = `${cx + dx},${cy + dy},${cz + dz}`;
            const bucket = grid.get(neighborKey);
            if (!bucket) continue;

            for (const idB of bucket) {
              if (idA >= idB) continue; // Process each pair once
              const nodeB = byId.get(idB);
              if (!nodeB?.parentId) continue;

              const posB = positioned.get(idB)!;
              const diffX = posB[0] - posA[0];
              const diffY = posB[1] - posA[1];
              const diffZ = posB[2] - posA[2];
              const distSq = diffX * diffX + diffY * diffY + diffZ * diffZ;

              if (distSq < minSeparation * minSeparation && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const overlap = (minSeparation - dist) * 0.35;
                const nx = (diffX / dist) * overlap;
                const nz = (diffZ / dist) * overlap;

                posA[0] -= nx;
                posA[2] -= nz;
                posB[0] += nx;
                posB[2] += nz;
              }
            }
          }
        }
      }
    }
  }

  return nodes.map((node) => {
    const p = positioned.get(node.id) ?? [0, 0, 0];
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
  band?: number;
  isOverflowIndicator?: boolean;
  overflowCount?: number;
}

/**
 * Computes deterministic 2D positions replicating REFERENCE_ART/2D_APPROVED.png:
 * - Central circular project root node at (0, 0)
 * - Radial distribution of top-level directories around root with dynamic perimeter sizing
 * - Multi-band concentric progressive disclosure for large folders (preventing overcrowding)
 * - Directory nodes prioritized over files
 * - Deterministic, zero random jitter, stable coordinates
 */
export function calculate2DLayout(
  nodes: ProjectNode[],
  expandedIds: Set<string>,
  rootId?: string
): Map<string, Node2DPosition> {
  const result = new Map<string, Node2DPosition>();
  const byParent = new Map<string | null, ProjectNode[]>();

  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const root = nodes.find((n) => n.id === rootId) ?? nodes.find((n) => n.kind === 'project') ?? nodes[0];
  if (!root) return result;

  // Root at center
  result.set(root.id, { x: 0, y: 0, angle: 0 });

  // Top level directories (depth 1)
  const topLevel = (byParent.get(root.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const topCount = topLevel.length;

  // Dynamic root orbit radius: ensures capsules have at least ~140px perimeter arc spacing
  const minArcSpacing = 145;
  const circumferenceNeeded = topCount * minArcSpacing;
  const radiusFromCount = circumferenceNeeded / (2 * Math.PI);
  const baseRadius = Math.max(topCount <= 6 ? 260 : topCount <= 10 ? 300 : 340, radiusFromCount);

  topLevel.forEach((dir, i) => {
    // Distribute evenly around the circle, starting from top (angle -PI/2)
    const angle = (i / Math.max(1, topCount)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * baseRadius;
    const y = Math.sin(angle) * baseRadius;
    result.set(dir.id, { x, y, angle });

    // If expanded, fan out children with progressive multi-band disclosure
    if (expandedIds.has(dir.id)) {
      layoutChildren2D(dir.id, x, y, angle, 1, byParent, expandedIds, result);
    }
  });

  return result;
}

const BAND_CAPACITIES = [8, 12, 16, 20];
const MAX_CHILDREN_DISPLAYED = 36;

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
  const rawChildren = byParent.get(parentId) ?? [];
  if (!rawChildren.length) return;

  // Prioritize directory nodes over file nodes, then alphabetical
  const children = [...rawChildren].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const totalCount = children.length;
  const displayCount = Math.min(totalCount, MAX_CHILDREN_DISPLAYED);
  const displayedChildren = children.slice(0, displayCount);
  const overflowCount = totalCount - displayCount;

  // Partition displayed children across concentric radial bands
  const bands: ProjectNode[][] = [];
  let remaining = [...displayedChildren];
  for (let b = 0; b < BAND_CAPACITIES.length && remaining.length > 0; b += 1) {
    const cap = BAND_CAPACITIES[b];
    bands.push(remaining.slice(0, cap));
    remaining = remaining.slice(cap);
  }
  if (remaining.length > 0 && bands.length > 0) {
    bands[bands.length - 1].push(...remaining);
  }

  bands.forEach((bandItems, bandIndex) => {
    const bandCount = bandItems.length;
    if (bandCount === 0) return;

    // Each band radiates outward: Band 0 at 170px, Band 1 at 265px, etc.
    const radialDistance = 170 + bandIndex * 95 + (depth - 1) * 35;
    const minArcSpacing = 105;
    const arcSpread = Math.max(minArcSpacing * (bandCount - 1), 70);
    const maxSpread = Math.min(Math.PI * 0.85, arcSpread / radialDistance);

    bandItems.forEach((child, idx) => {
      let offsetAngle = 0;
      if (bandCount > 1) {
        const step = maxSpread / (bandCount - 1);
        offsetAngle = -maxSpread / 2 + idx * step;
      }
      const angle = parentAngle + offsetAngle;
      const x = parentX + Math.cos(angle) * radialDistance;
      const y = parentY + Math.sin(angle) * radialDistance;

      result.set(child.id, { x, y, angle, band: bandIndex });

      if (child.kind === 'directory' && expandedIds.has(child.id)) {
        layoutChildren2D(child.id, x, y, angle, depth + 1, byParent, expandedIds, result);
      }
    });
  });

  // If there are more than MAX_CHILDREN_DISPLAYED items, add an overflow indicator position
  if (overflowCount > 0) {
    const overflowDistance = 145 + bands.length * 80 + (depth - 1) * 25;
    const overflowAngle = parentAngle;
    const ox = parentX + Math.cos(overflowAngle) * overflowDistance;
    const oy = parentY + Math.sin(overflowAngle) * overflowDistance;
    result.set(`${parentId}__more`, {
      x: ox,
      y: oy,
      angle: overflowAngle,
      isOverflowIndicator: true,
      overflowCount,
    });
  }
}

function ancestorIds(byId: Map<string, ProjectNode>, node: ProjectNode): string[] {
  const ids: string[] = [];
  let current: ProjectNode | undefined = node;
  while (current) {
    ids.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return ids;
}

/**
 * Computes visible nodes for graph rendering.
 * Strict rules:
 * - Project root is always visible
 * - Top-level nodes (depth <= 1) are always visible
 * - Descendants are visible ONLY if their direct parent branch is expanded
 * - Selected node and its complete ancestor chain are always kept visible
 * - Siblings of selected node may remain for orientation
 * - Collapsed branches MUST NOT reappear simply because spare capacity exists
 * - Hard maxNodes cap is strictly enforced
 */
export function visibleGraphNodes(
  nodes: ProjectNode[],
  selectedId: string | null,
  expandedIds?: Set<string>,
  maxNodes = 200
): ProjectNode[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const byParent = new Map<string | null, ProjectNode[]>();
  for (const node of nodes) {
    const group = byParent.get(node.parentId) ?? [];
    group.push(node);
    byParent.set(node.parentId, group);
  }

  const merged = new Map<string, ProjectNode>();
  const mustKeep = new Set<string>();

  // 1. Root (depth 0) and top-level items (depth 1) are base
  for (const node of nodes) {
    if (node.depth <= 1) {
      merged.set(node.id, node);
      if (node.depth === 0) mustKeep.add(node.id);
    }
  }

  // 2. Expanded branches: include children ONLY when their parent is expanded
  if (expandedIds && expandedIds.size > 0) {
    for (const expId of expandedIds) {
      const children = byParent.get(expId) ?? [];
      for (const child of children) {
        merged.set(child.id, child);
      }
    }
  }

  // 3. Selected node, its complete ancestor chain, and direct context
  if (selectedId) {
    const selected = byId.get(selectedId);
    if (selected) {
      const ancIds = ancestorIds(byId, selected);
      for (const id of ancIds) {
        const anc = byId.get(id);
        if (anc) {
          merged.set(anc.id, anc);
          mustKeep.add(anc.id);
        }
      }
      mustKeep.add(selected.id);

      // Include direct children of selected node
      const children = byParent.get(selected.id) ?? [];
      for (const child of children) {
        merged.set(child.id, child);
      }

      // Include siblings of selected node for orientation
      if (selected.parentId) {
        const siblings = byParent.get(selected.parentId) ?? [];
        for (const sib of siblings) {
          merged.set(sib.id, sib);
        }
      }
    }
  }

  // CRITICAL: NO fallback that fills spare capacity with arbitrary depth-2 nodes!
  // Collapsed branches remain strictly collapsed.

  // Sort preserving mustKeep first, then depth, then name
  const ordered = Array.from(merged.values()).sort((a, b) => {
    const aMust = mustKeep.has(a.id) ? 1 : 0;
    const bMust = mustKeep.has(b.id) ? 1 : 0;
    if (aMust !== bMust) return bMust - aMust;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.name.localeCompare(b.name);
  });

  return ordered.slice(0, maxNodes);
}


