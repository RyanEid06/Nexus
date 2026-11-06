import type { DependencyEdge, ProjectIndex, ProjectNode } from '../domain/models';
import type { RelationshipFilterMode } from '../store/useAppStore';
import type { Node2DPosition } from './layout';

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const MAX_GRAPH_REAL_NODES = 72;
export const MAX_DIRECT_REAL_CHILDREN = 24;
export const MAX_EXPANDED_BRANCH_CHILDREN = 20;
export const MAX_VISIBLE_DEPENDENCY_EDGES = 60;

export interface ViewportOverflowNode {
  id: string;
  parentId: string;
  kind: 'overflow';
  overflowType: 'all' | 'directories' | 'files';
  hiddenCount: number;
  totalChildrenCount: number;
  label: string;
  position2D: Node2DPosition;
  position3D: [number, number, number];
}

export interface ViewportHierarchyEdge {
  id: string;
  sourceId: string;
  targetId: string;
  isOverflow?: boolean;
}

export interface ViewportDependencyEdge {
  id: string;
  sourceId: string;
  targetId: string;
  edge: DependencyEdge;
}

export interface GraphViewportModel {
  focusNode: ProjectNode;
  focusParentNode: ProjectNode | null;
  breadcrumbTrail: ProjectNode[];
  isProjectRootFocused: boolean;

  // Real visible nodes (strictly bounded by budget <= 72)
  visibleNodes: ProjectNode[];
  visibleNodesMap: Map<string, ProjectNode>;

  // Overflow aggregates (navigation affordances)
  overflowNodes: ViewportOverflowNode[];

  // Guaranteed deterministic 2D & 3D coordinates for EVERY visible node
  positions2D: Map<string, Node2DPosition>;
  positions3D: Map<string, [number, number, number]>;

  // Edges
  hierarchyEdges: ViewportHierarchyEdge[];
  visibleDependencyEdges: ViewportDependencyEdge[];
  inScopeDependencyEdges: Array<{ edge: DependencyEdge; sId: string; tId: string }>;
  visibleOutgoingByNodeId: Map<string, ViewportDependencyEdge[]>;
  visibleIncomingByNodeId: Map<string, ViewportDependencyEdge[]>;

  // Statistics
  totalDirectChildren: number;
  visibleDirectChildren: number;
  hiddenDirectChildren: number;

  // Dependency metrics
  totalDependenciesInScope: number;
  visibleDependenciesCount: number;
  dependencyDensityCapped: boolean;
}

/**
 * Pre-indexed graph structure memoized per project identity.
 * Precomputes lookups for fast O(1) access so pointer hovers
 * never perform full-project iterations over 50,000+ nodes.
 */
export interface ProjectGraphIndex {
  project: ProjectIndex;
  byId: Map<string, ProjectNode>;
  byParent: Map<string | null, ProjectNode[]>;
  prioritizedChildrenByParentId: Map<string | null, ProjectNode[]>;
  pathToId: Map<string, string>;
  rootNode: ProjectNode;
  dependenciesBySourceId: Map<string, Array<{ edge: DependencyEdge; targetId: string }>>;
  dependenciesByTargetId: Map<string, Array<{ edge: DependencyEdge; sourceId: string }>>;
}

const graphIndexCache = new WeakMap<ProjectIndex, ProjectGraphIndex>();

export function buildGraphIndex(project: ProjectIndex): ProjectGraphIndex {
  const cached = graphIndexCache.get(project);
  if (cached) return cached;

  const byId = new Map<string, ProjectNode>();
  const byParent = new Map<string | null, ProjectNode[]>();
  const pathToId = new Map<string, string>();

  let rootNode: ProjectNode | undefined;

  for (const node of project.nodes) {
    byId.set(node.id, node);
    pathToId.set(node.path, node.id);

    if (node.kind === 'project' && !rootNode) {
      rootNode = node;
    }

    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  if (!rootNode) {
    rootNode = project.nodes[0];
  }

  const prioritizedChildrenByParentId = new Map<string | null, ProjectNode[]>();
  for (const [parentId, children] of byParent.entries()) {
    prioritizedChildrenByParentId.set(parentId, prioritizeChildren(children));
  }

  const dependenciesBySourceId = new Map<string, Array<{ edge: DependencyEdge; targetId: string }>>();
  const dependenciesByTargetId = new Map<string, Array<{ edge: DependencyEdge; sourceId: string }>>();

  if (project.dependencies?.edges) {
    for (const edge of project.dependencies.edges) {
      if (!edge.isExternal && edge.isResolved) {
        const sId = pathToId.get(edge.sourcePath);
        const tId = pathToId.get(edge.targetResolvedPath ?? edge.targetPath);
        if (sId && tId && sId !== tId) {
          let outList = dependenciesBySourceId.get(sId);
          if (!outList) {
            outList = [];
            dependenciesBySourceId.set(sId, outList);
          }
          outList.push({ edge, targetId: tId });

          let inList = dependenciesByTargetId.get(tId);
          if (!inList) {
            inList = [];
            dependenciesByTargetId.set(tId, inList);
          }
          inList.push({ edge, sourceId: sId });
        }
      }
    }
  }

  const index: ProjectGraphIndex = {
    project,
    byId,
    byParent,
    prioritizedChildrenByParentId,
    pathToId,
    rootNode,
    dependenciesBySourceId,
    dependenciesByTargetId,
  };

  graphIndexCache.set(project, index);
  return index;
}

/**
 * Deterministically sorts child nodes:
 * 1. Directories before files
 * 2. Descendant/subtree file count (larger architecture first)
 * 3. File LOC/size
 * 4. Stable alphabetical name tie-breaking
 */
export function prioritizeChildren(children: ProjectNode[]): ProjectNode[] {
  return [...children].sort((a, b) => {
    // 1. Directory before file
    if (a.kind !== b.kind) {
      if (a.kind === 'directory') return -1;
      if (b.kind === 'directory') return 1;
    }

    // 2. If both directories, larger descendant count first
    if (a.kind === 'directory' && b.kind === 'directory') {
      const descA = a.descendantFiles ?? 0;
      const descB = b.descendantFiles ?? 0;
      if (descA !== descB) return descB - descA;
    }

    // 3. If files, higher LOC first
    if (a.kind === 'file' && b.kind === 'file') {
      if (a.loc !== b.loc) return b.loc - a.loc;
    }

    // 4. Stable alphabetical tie-breaking
    return a.name.localeCompare(b.name);
  });
}

export interface ComputeViewportOptions {
  project: ProjectIndex;
  graphIndex?: ProjectGraphIndex;
  mapFocusNodeId: string | null;
  selectedNodeId: string | null;
  expandedNodeIds: ReadonlySet<string>;
  relationshipMode?: RelationshipFilterMode;
  hoveredNodeId?: string | null;
}

export interface PrioritizeDependencyOptions {
  hoveredNodeId?: string | null;
  selectedNodeId?: string | null;
  focusNodeId?: string | null;
  limit?: number;
}

/**
 * Bounded dependency-edge selection method that reprioritizes:
 * 1. hovered-node relationships
 * 2. selected-node relationships
 * 3. focused-node relationships
 * 4. deterministic remaining edges
 * Operating strictly over bounded in-scope edges (between visible nodes),
 * capped at limit (default MAX_VISIBLE_DEPENDENCY_EDGES = 60).
 */
export function prioritizeDependencyEdges(
  inScopeEdges: Array<{ edge: DependencyEdge; sId: string; tId: string }>,
  options: PrioritizeDependencyOptions = {}
): {
  visibleDependencyEdges: ViewportDependencyEdge[];
  visibleOutgoingByNodeId: Map<string, ViewportDependencyEdge[]>;
  visibleIncomingByNodeId: Map<string, ViewportDependencyEdge[]>;
} {
  const limit = options.limit ?? MAX_VISIBLE_DEPENDENCY_EDGES;
  const { hoveredNodeId, selectedNodeId, focusNodeId } = options;

  let chosenEdges: Array<{ edge: DependencyEdge; sId: string; tId: string }>;

  if (inScopeEdges.length <= limit) {
    chosenEdges = inScopeEdges;
  } else {
    const hoveredGroup: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];
    const selectedGroup: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];
    const focusGroup: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];
    const remainingGroup: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];

    for (const item of inScopeEdges) {
      const isHovered = Boolean(hoveredNodeId && (item.sId === hoveredNodeId || item.tId === hoveredNodeId));
      const isSelected = Boolean(selectedNodeId && (item.sId === selectedNodeId || item.tId === selectedNodeId));
      const isFocused = Boolean(focusNodeId && (item.sId === focusNodeId || item.tId === focusNodeId));

      if (isHovered) {
        hoveredGroup.push(item);
      } else if (isSelected) {
        selectedGroup.push(item);
      } else if (isFocused) {
        focusGroup.push(item);
      } else {
        remainingGroup.push(item);
      }
    }

    chosenEdges = [...hoveredGroup, ...selectedGroup, ...focusGroup, ...remainingGroup].slice(0, limit);
  }

  const visibleDependencyEdges: ViewportDependencyEdge[] = [];
  const visibleOutgoingByNodeId = new Map<string, ViewportDependencyEdge[]>();
  const visibleIncomingByNodeId = new Map<string, ViewportDependencyEdge[]>();

  for (const { edge, sId, tId } of chosenEdges) {
    const vDep: ViewportDependencyEdge = {
      id: `dep-${edge.id}`,
      sourceId: sId,
      targetId: tId,
      edge,
    };
    visibleDependencyEdges.push(vDep);

    let outList = visibleOutgoingByNodeId.get(sId);
    if (!outList) {
      outList = [];
      visibleOutgoingByNodeId.set(sId, outList);
    }
    outList.push(vDep);

    let inList = visibleIncomingByNodeId.get(tId);
    if (!inList) {
      inList = [];
      visibleIncomingByNodeId.set(tId, inList);
    }
    inList.push(vDep);
  }

  return {
    visibleDependencyEdges,
    visibleOutgoingByNodeId,
    visibleIncomingByNodeId,
  };
}

/**
 * Builds the unified visibility model consumed identically by both 2D and 3D maps.
 * Enforces a strict maximum of MAX_GRAPH_REAL_NODES (72).
 * Mandatory nodes (focus node and required selected path) are reserved FIRST.
 */
export function computeGraphViewport({
  project,
  graphIndex,
  mapFocusNodeId,
  selectedNodeId,
  expandedNodeIds,
  relationshipMode = 'hierarchy',
  hoveredNodeId = null,
}: ComputeViewportOptions): GraphViewportModel {
  const index = graphIndex ?? buildGraphIndex(project);
  const { byId, byParent, rootNode } = index;

  // 1. Resolve Focus Node & Breadcrumb Trail
  let focusNode = (mapFocusNodeId ? byId.get(mapFocusNodeId) : null) ?? rootNode;

  // Check if selectedNodeId is a descendant of focusNode
  const selNode = selectedNodeId ? byId.get(selectedNodeId) : null;
  let isDescendantOfFocus = false;
  const fullPathDown: ProjectNode[] = [];

  if (selNode && selNode.id !== focusNode.id) {
    let curr: ProjectNode | undefined = selNode;
    const chain: ProjectNode[] = [];
    while (curr) {
      if (curr.id === focusNode.id) {
        isDescendantOfFocus = true;
        break;
      }
      chain.unshift(curr);
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }
    if (isDescendantOfFocus) {
      fullPathDown.push(...chain);
    }
  }

  // If descendant path is deeper than available capacity (71 nodes below focus),
  // bound the selected path nodes so they strictly fit within MAX_GRAPH_REAL_NODES - 1,
  // while keeping focusNode strictly equal to mapFocusNodeId / store focus.
  if (isDescendantOfFocus && fullPathDown.length > MAX_GRAPH_REAL_NODES - 1) {
    fullPathDown.splice(MAX_GRAPH_REAL_NODES - 1);
  }

  const isProjectRootFocused = focusNode.id === rootNode.id;

  // Build breadcrumb trail from root down to focusNode
  const breadcrumbTrail: ProjectNode[] = [];
  let bCurr: ProjectNode | undefined = focusNode;
  while (bCurr) {
    breadcrumbTrail.unshift(bCurr);
    bCurr = bCurr.parentId ? byId.get(bCurr.parentId) : undefined;
  }

  const focusParentNode = focusNode.parentId ? byId.get(focusNode.parentId) ?? null : null;

  // 2. Strict Budget Allocation Model
  // Mandatory Step 1: Reserve Focus Node (1 slot)
  let budgetRemaining = MAX_GRAPH_REAL_NODES - 1;

  // Mandatory Step 2: Reserve Selected Path Nodes
  const selectedPathNodes: ProjectNode[] = isDescendantOfFocus ? fullPathDown : [];
  budgetRemaining -= selectedPathNodes.length;

  const directPathChild = selectedPathNodes.length > 0 ? selectedPathNodes[0] : null;

  // Step 3: Direct Children of Focus Node (Pre-sorted in index, NO repeated sorting)
  const sortedDirectChildren = index.prioritizedChildrenByParentId.get(focusNode.id) ?? [];
  const totalDirectChildren = sortedDirectChildren.length;

  const visibleDirectChildrenList: ProjectNode[] = [];
  const hiddenDirectChildrenList: ProjectNode[] = [];

  if (directPathChild) {
    visibleDirectChildrenList.push(directPathChild);
  }

  // Allocate remaining capacity to direct children (up to MAX_DIRECT_REAL_CHILDREN)
  const maxOtherDirectSlots = Math.max(
    0,
    Math.min(MAX_DIRECT_REAL_CHILDREN - (directPathChild ? 1 : 0), budgetRemaining)
  );

  for (const child of sortedDirectChildren) {
    if (directPathChild && child.id === directPathChild.id) continue;
    if (visibleDirectChildrenList.length < (directPathChild ? maxOtherDirectSlots + 1 : maxOtherDirectSlots)) {
      visibleDirectChildrenList.push(child);
      budgetRemaining -= 1;
    } else {
      hiddenDirectChildrenList.push(child);
    }
  }

  const hiddenDirectChildren = totalDirectChildren - visibleDirectChildrenList.length;

  // Step 4: Expanded Child Branches (Pre-sorted in index, NO repeated sorting)
  const visibleBranchChildren: ProjectNode[] = [];
  const branchOverflowMap = new Map<string, { hiddenCount: number; totalCount: number }>();

  for (const child of visibleDirectChildrenList) {
    if (child.kind === 'directory' && expandedNodeIds.has(child.id)) {
      const sortedBranch = index.prioritizedChildrenByParentId.get(child.id) ?? [];
      const totalBranch = sortedBranch.length;
      if (totalBranch === 0) continue;

      // Check if any selectedPathNode is a direct child of this directory
      const pathBranchChild = selectedPathNodes.find((p) => p.parentId === child.id);

      const maxBranchSlots = Math.max(
        0,
        Math.min(MAX_EXPANDED_BRANCH_CHILDREN - (pathBranchChild ? 1 : 0), budgetRemaining)
      );

      const branchShown: ProjectNode[] = [];
      if (pathBranchChild) {
        branchShown.push(pathBranchChild);
      }

      for (const b of sortedBranch) {
        if (pathBranchChild && b.id === pathBranchChild.id) continue;
        if (branchShown.length < (pathBranchChild ? maxBranchSlots + 1 : maxBranchSlots)) {
          branchShown.push(b);
          budgetRemaining -= 1;
        }
      }

      if (totalBranch > branchShown.length) {
        branchOverflowMap.set(child.id, {
          hiddenCount: totalBranch - branchShown.length,
          totalCount: totalBranch,
        });
      }

      visibleBranchChildren.push(...branchShown);
    }
  }

  // Step 5: Assemble Visible Real Nodes
  const visibleNodesSet = new Set<ProjectNode>();
  visibleNodesSet.add(focusNode);
  for (const node of visibleDirectChildrenList) visibleNodesSet.add(node);
  for (const node of visibleBranchChildren) visibleNodesSet.add(node);
  for (const node of selectedPathNodes) visibleNodesSet.add(node);

  const visibleNodes = Array.from(visibleNodesSet);
  // Strict guarantee: visibleNodes.length <= MAX_GRAPH_REAL_NODES
  if (visibleNodes.length > MAX_GRAPH_REAL_NODES) {
    visibleNodes.splice(MAX_GRAPH_REAL_NODES);
  }
  const visibleNodesMap = new Map(visibleNodes.map((n) => [n.id, n]));

  // Step 6: Overflow Aggregates
  const overflowNodes: ViewportOverflowNode[] = [];

  // Focus direct children overflow indicator
  if (hiddenDirectChildren > 0) {
    const hiddenDirs = hiddenDirectChildrenList.filter((n) => n.kind === 'directory').length;
    const hiddenFiles = hiddenDirectChildrenList.filter((n) => n.kind === 'file').length;

    let label = `+ ${hiddenDirectChildren.toLocaleString()} more`;
    if (hiddenDirs > 0 && hiddenFiles > 0) {
      label = `+ ${hiddenDirs.toLocaleString()} dirs, ${hiddenFiles.toLocaleString()} files`;
    } else if (hiddenDirs > 0) {
      label = `+ ${hiddenDirs.toLocaleString()} more folders`;
    } else if (hiddenFiles > 0) {
      label = `+ ${hiddenFiles.toLocaleString()} more files`;
    }

    overflowNodes.push({
      id: `${focusNode.id}__overflow`,
      parentId: focusNode.id,
      kind: 'overflow',
      overflowType: hiddenDirs > 0 && hiddenFiles === 0 ? 'directories' : hiddenFiles > 0 && hiddenDirs === 0 ? 'files' : 'all',
      hiddenCount: hiddenDirectChildren,
      totalChildrenCount: totalDirectChildren,
      label,
      position2D: { x: 0, y: 0, angle: 0 },
      position3D: [0, 0, 0],
    });
  }

  // Branch overflows
  for (const [branchParentId, { hiddenCount, totalCount }] of branchOverflowMap.entries()) {
    overflowNodes.push({
      id: `${branchParentId}__overflow`,
      parentId: branchParentId,
      kind: 'overflow',
      overflowType: 'all',
      hiddenCount,
      totalChildrenCount: totalCount,
      label: `+ ${hiddenCount.toLocaleString()} more`,
      position2D: { x: 0, y: 0, angle: 0 },
      position3D: [0, 0, 0],
    });
  }

  // Step 7: Deterministic 2D & 3D Coordinates (Every single visible node is guaranteed valid coordinates)
  const positions2D = new Map<string, Node2DPosition>();
  const positions3D = new Map<string, [number, number, number]>();

  // Center focus node at (0, 0) in 2D and (0, 0, 0) in 3D
  positions2D.set(focusNode.id, { x: 0, y: 0, angle: 0 });
  positions3D.set(focusNode.id, [0, 0, 0]);

  // Direct children placement
  const directCount = visibleDirectChildrenList.length + (hiddenDirectChildren > 0 ? 1 : 0);
  const minArcSpacing = 145;
  const circumferenceNeeded = directCount * minArcSpacing;
  const radiusFromCount = circumferenceNeeded / (2 * Math.PI);
  const base2DRadius = Math.max(directCount <= 6 ? 260 : directCount <= 12 ? 310 : 360, radiusFromCount);
  const base3DRadius = Math.max(3.2, 2.6 * Math.sqrt(Math.max(1, directCount) * 0.18) + 2.2);

  visibleDirectChildrenList.forEach((child, i) => {
    const angle = (i / Math.max(1, directCount)) * Math.PI * 2 - Math.PI / 2;
    const x2D = Math.cos(angle) * base2DRadius;
    const y2D = Math.sin(angle) * base2DRadius;
    positions2D.set(child.id, { x: x2D, y: y2D, angle });

    const angle3D = i * GOLDEN_ANGLE;
    const lift3D = -(0.55 + i * 0.08);
    const x3D = Math.cos(angle3D) * base3DRadius;
    const z3D = Math.sin(angle3D) * base3DRadius;
    positions3D.set(child.id, [x3D, lift3D, z3D]);

    // If expanded, fan out branch children in its sector
    if (child.kind === 'directory' && expandedNodeIds.has(child.id)) {
      const branchItems = visibleBranchChildren.filter((b) => b.parentId === child.id);
      const branchOverflow = overflowNodes.find((o) => o.parentId === child.id);
      const totalBranchSlots = branchItems.length + (branchOverflow ? 1 : 0);

      if (totalBranchSlots > 0) {
        const branch2DRadius = 175;
        const maxSectorAngle = Math.min(Math.PI * 0.75, (totalBranchSlots * 85) / branch2DRadius);

        branchItems.forEach((bChild, bIdx) => {
          let offsetAngle = 0;
          if (totalBranchSlots > 1) {
            offsetAngle = -maxSectorAngle / 2 + (bIdx / (totalBranchSlots - 1)) * maxSectorAngle;
          }
          const bAngle = angle + offsetAngle;
          const bx2D = x2D + Math.cos(bAngle) * branch2DRadius;
          const by2D = y2D + Math.sin(bAngle) * branch2DRadius;
          positions2D.set(bChild.id, { x: bx2D, y: by2D, angle: bAngle });

          const bAngle3D = angle3D + bIdx * 0.55;
          const bLift3D = lift3D - 0.45 - bIdx * 0.06;
          const bx3D = x3D + Math.cos(bAngle3D) * 2.2;
          const bz3D = z3D + Math.sin(bAngle3D) * 2.2;
          positions3D.set(bChild.id, [bx3D, bLift3D, bz3D]);
        });

        if (branchOverflow) {
          const overflowAngle = angle + maxSectorAngle / 2;
          const ox2D = x2D + Math.cos(overflowAngle) * (branch2DRadius + 40);
          const oy2D = y2D + Math.sin(overflowAngle) * (branch2DRadius + 40);
          branchOverflow.position2D = {
            x: ox2D,
            y: oy2D,
            angle: overflowAngle,
            isOverflowIndicator: true,
            overflowCount: branchOverflow.hiddenCount,
          };
          positions2D.set(branchOverflow.id, branchOverflow.position2D);

          const ox3D = x3D + Math.cos(angle3D + branchItems.length * 0.55) * 2.8;
          const oz3D = z3D + Math.sin(angle3D + branchItems.length * 0.55) * 2.8;
          branchOverflow.position3D = [ox3D, lift3D - 0.5 - branchItems.length * 0.06, oz3D];
          positions3D.set(branchOverflow.id, branchOverflow.position3D);
        }
      }
    }
  });

  // Direct overflow node placement
  const directOverflow = overflowNodes.find((o) => o.parentId === focusNode.id);
  if (directOverflow) {
    const overflowAngle = ((directCount - 1) / Math.max(1, directCount)) * Math.PI * 2 - Math.PI / 2;
    const ox2D = Math.cos(overflowAngle) * (base2DRadius + 20);
    const oy2D = Math.sin(overflowAngle) * (base2DRadius + 20);
    directOverflow.position2D = {
      x: ox2D,
      y: oy2D,
      angle: overflowAngle,
      isOverflowIndicator: true,
      overflowCount: directOverflow.hiddenCount,
    };
    positions2D.set(directOverflow.id, directOverflow.position2D);

    const angle3D = (directCount - 1) * GOLDEN_ANGLE;
    const lift3D = -(0.55 + (directCount - 1) * 0.08);
    const ox3D = Math.cos(angle3D) * (base3DRadius + 0.6);
    const oz3D = Math.sin(angle3D) * (base3DRadius + 0.6);
    directOverflow.position3D = [ox3D, lift3D, oz3D];
    positions3D.set(directOverflow.id, directOverflow.position3D);
  }

  // Selected Path Placement Guarantee:
  // Any visible node along the selected path that was not positioned by direct children or expanded branches
  // is placed deterministically extending outward along the ancestor ray.
  for (let idx = 0; idx < selectedPathNodes.length; idx += 1) {
    const pNode = selectedPathNodes[idx];
    if (!positions2D.has(pNode.id)) {
      const parentId = pNode.parentId ?? focusNode.id;
      const parentPos2D = positions2D.get(parentId) ?? { x: 0, y: 0, angle: 0 };
      const parentPos3D = positions3D.get(parentId) ?? [0, 0, 0];

      const pAngle = Math.atan2(parentPos2D.y, parentPos2D.x) || (Math.PI / 4 + idx * 0.2);
      const step2D = 140;
      const x2D = parentPos2D.x + Math.cos(pAngle) * step2D;
      const y2D = parentPos2D.y + Math.sin(pAngle) * step2D;
      positions2D.set(pNode.id, { x: x2D, y: y2D, angle: pAngle });

      const dist3D = Math.hypot(parentPos3D[0], parentPos3D[2]) || 2.0;
      const normX = parentPos3D[0] / dist3D || Math.cos(pAngle);
      const normZ = parentPos3D[2] / dist3D || Math.sin(pAngle);
      const x3D = parentPos3D[0] + normX * 1.8;
      const y3D = parentPos3D[1] - 0.45;
      const z3D = parentPos3D[2] + normZ * 1.8;
      positions3D.set(pNode.id, [x3D, y3D, z3D]);
    }
  }

  // Final Invariant Check: Every single visible node MUST have a 2D and 3D coordinate.
  // Never fall back to [0,0,0] for non-focus nodes.
  for (let idx = 0; idx < visibleNodes.length; idx += 1) {
    const vNode = visibleNodes[idx];
    if (!positions2D.has(vNode.id)) {
      const fallbackAngle = (idx * GOLDEN_ANGLE) % (2 * Math.PI);
      const fallback2D = { x: Math.cos(fallbackAngle) * 320, y: Math.sin(fallbackAngle) * 320, angle: fallbackAngle };
      positions2D.set(vNode.id, fallback2D);
    }
    if (!positions3D.has(vNode.id)) {
      const fallbackAngle = (idx * GOLDEN_ANGLE);
      positions3D.set(vNode.id, [Math.cos(fallbackAngle) * 4.0, -1.0 - idx * 0.05, Math.sin(fallbackAngle) * 4.0]);
    }
  }

  // Step 8: Hierarchy Edges
  const hierarchyEdges: ViewportHierarchyEdge[] = [];
  for (const node of visibleNodes) {
    if (node.parentId && visibleNodesMap.has(node.parentId)) {
      hierarchyEdges.push({
        id: `h-${node.parentId}-${node.id}`,
        sourceId: node.parentId,
        targetId: node.id,
      });
    }
  }

  for (const overflow of overflowNodes) {
    if (visibleNodesMap.has(overflow.parentId)) {
      hierarchyEdges.push({
        id: `h-${overflow.parentId}-${overflow.id}`,
        sourceId: overflow.parentId,
        targetId: overflow.id,
        isOverflow: true,
      });
    }
  }

  // Step 9: Adaptive Dependency Edges using Pre-indexed Dependency Adjacency
  // Iterates ONLY over the <= 72 visible nodes rather than all project-wide edges.
  let inScopeEdges: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];
  let visibleDependencyEdges: ViewportDependencyEdge[] = [];
  let visibleOutgoingByNodeId = new Map<string, ViewportDependencyEdge[]>();
  let visibleIncomingByNodeId = new Map<string, ViewportDependencyEdge[]>();
  let totalDependenciesInScope = 0;
  let dependencyDensityCapped = false;

  const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';

  if (showDependencies) {
    for (const vNode of visibleNodes) {
      const outgoing = index.dependenciesBySourceId.get(vNode.id);
      if (outgoing) {
        for (const item of outgoing) {
          if (visibleNodesMap.has(item.targetId)) {
            inScopeEdges.push({ edge: item.edge, sId: vNode.id, tId: item.targetId });
          }
        }
      }
    }

    totalDependenciesInScope = inScopeEdges.length;
    dependencyDensityCapped = totalDependenciesInScope > MAX_VISIBLE_DEPENDENCY_EDGES;

    const depResult = prioritizeDependencyEdges(inScopeEdges, {
      hoveredNodeId,
      selectedNodeId,
      focusNodeId: focusNode.id,
      limit: MAX_VISIBLE_DEPENDENCY_EDGES,
    });

    visibleDependencyEdges = depResult.visibleDependencyEdges;
    visibleOutgoingByNodeId = depResult.visibleOutgoingByNodeId;
    visibleIncomingByNodeId = depResult.visibleIncomingByNodeId;
  }

  return {
    focusNode,
    focusParentNode,
    breadcrumbTrail,
    isProjectRootFocused,
    visibleNodes,
    visibleNodesMap,
    overflowNodes,
    positions2D,
    positions3D,
    hierarchyEdges,
    inScopeDependencyEdges: inScopeEdges,
    visibleDependencyEdges,
    visibleOutgoingByNodeId,
    visibleIncomingByNodeId,
    totalDirectChildren,
    visibleDirectChildren: visibleDirectChildrenList.length,
    hiddenDirectChildren,
    totalDependenciesInScope,
    visibleDependenciesCount: visibleDependencyEdges.length,
    dependencyDensityCapped,
  };
}
