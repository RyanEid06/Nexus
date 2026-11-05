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

  // Real visible nodes (bounded by budget)
  visibleNodes: ProjectNode[];
  visibleNodesMap: Map<string, ProjectNode>;

  // Overflow aggregates (navigation affordances)
  overflowNodes: ViewportOverflowNode[];

  // Deterministic 2D & 3D coordinates
  positions2D: Map<string, Node2DPosition>;
  positions3D: Map<string, [number, number, number]>;

  // Edges
  hierarchyEdges: ViewportHierarchyEdge[];
  visibleDependencyEdges: ViewportDependencyEdge[];

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
 * Deterministically sorts direct child nodes:
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

/**
 * Builds the unified visibility model consumed identically by both 2D and 3D maps.
 */
export function computeGraphViewport({
  project,
  mapFocusNodeId,
  selectedNodeId,
  expandedNodeIds,
  relationshipMode = 'hierarchy',
  hoveredNodeId = null,
}: {
  project: ProjectIndex;
  mapFocusNodeId: string | null;
  selectedNodeId: string | null;
  expandedNodeIds: ReadonlySet<string>;
  relationshipMode?: RelationshipFilterMode;
  hoveredNodeId?: string | null;
}): GraphViewportModel {
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const byParent = new Map<string | null, ProjectNode[]>();

  for (const node of project.nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  // 1. Resolve Focus Node & Breadcrumb Trail
  const rootNode = project.nodes.find((n) => n.kind === 'project') ?? project.nodes[0];
  const focusNode = (mapFocusNodeId ? byId.get(mapFocusNodeId) : null) ?? rootNode;
  const isProjectRootFocused = focusNode.id === rootNode.id;

  // Build breadcrumb trail from root down to focusNode
  const breadcrumbTrail: ProjectNode[] = [];
  let curr: ProjectNode | undefined = focusNode;
  while (curr) {
    breadcrumbTrail.unshift(curr);
    curr = curr.parentId ? byId.get(curr.parentId) : undefined;
  }

  const focusParentNode = focusNode.parentId ? byId.get(focusNode.parentId) ?? null : null;

  // 2. Direct Children of Focus Node
  const rawDirectChildren = byParent.get(focusNode.id) ?? [];
  const totalDirectChildren = rawDirectChildren.length;
  const sortedDirectChildren = prioritizeChildren(rawDirectChildren);

  // Selected node protection: if selectedNode is a direct child, it MUST be included
  let visibleDirectChildrenList: ProjectNode[] = [];
  let hiddenDirectChildrenList: ProjectNode[] = [];

  if (totalDirectChildren <= MAX_DIRECT_REAL_CHILDREN) {
    visibleDirectChildrenList = sortedDirectChildren;
  } else {
    // Budget direct children
    const budget = MAX_DIRECT_REAL_CHILDREN;
    const initialCut = sortedDirectChildren.slice(0, budget);
    const remainder = sortedDirectChildren.slice(budget);

    // If selectedNodeId is among direct children but was sliced into remainder, swap it in
    if (selectedNodeId && remainder.some((n) => n.id === selectedNodeId)) {
      const selectedChild = remainder.find((n) => n.id === selectedNodeId)!;
      // Replace the last item with selectedChild
      const last = initialCut.pop()!;
      initialCut.push(selectedChild);
      remainder.splice(remainder.indexOf(selectedChild), 1);
      remainder.push(last);
    }

    visibleDirectChildrenList = initialCut;
    hiddenDirectChildrenList = remainder;
  }

  const hiddenDirectChildren = hiddenDirectChildrenList.length;

  // 3. Expanded Child Branches
  // Only children of expanded visible directories may appear, up to MAX_EXPANDED_BRANCH_CHILDREN each
  const visibleBranchChildren: ProjectNode[] = [];
  const branchOverflowMap = new Map<string, { hiddenCount: number; totalCount: number }>();

  // Global budget tracker: start with focusNode + direct children
  let currentBudgetRemaining = MAX_GRAPH_REAL_NODES - (1 + visibleDirectChildrenList.length);

  for (const child of visibleDirectChildrenList) {
    if (child.kind === 'directory' && expandedNodeIds.has(child.id)) {
      const rawBranchChildren = byParent.get(child.id) ?? [];
      const totalBranch = rawBranchChildren.length;
      if (totalBranch === 0) continue;

      const sortedBranch = prioritizeChildren(rawBranchChildren);
      const branchCap = Math.min(MAX_EXPANDED_BRANCH_CHILDREN, Math.max(0, currentBudgetRemaining));

      let branchShown: ProjectNode[] = [];
      if (totalBranch <= branchCap) {
        branchShown = sortedBranch;
      } else {
        branchShown = sortedBranch.slice(0, branchCap);
        branchOverflowMap.set(child.id, {
          hiddenCount: totalBranch - branchCap,
          totalCount: totalBranch,
        });
      }

      // If selectedNode is inside this branch, make sure it is retained
      if (selectedNodeId && rawBranchChildren.some((n) => n.id === selectedNodeId)) {
        if (!branchShown.some((n) => n.id === selectedNodeId) && branchShown.length > 0) {
          const selNode = rawBranchChildren.find((n) => n.id === selectedNodeId)!;
          branchShown[branchShown.length - 1] = selNode;
        }
      }

      visibleBranchChildren.push(...branchShown);
      currentBudgetRemaining -= branchShown.length;
    }
  }

  // 4. Assemble Visible Real Nodes Set
  const visibleNodesSet = new Set<ProjectNode>();
  visibleNodesSet.add(focusNode);
  for (const node of visibleDirectChildrenList) visibleNodesSet.add(node);
  for (const node of visibleBranchChildren) visibleNodesSet.add(node);

  // Requirement: Selected node must never be removed if it is anywhere within the focus tree
  if (selectedNodeId && byId.has(selectedNodeId)) {
    const sel = byId.get(selectedNodeId)!;
    // Check if sel is a descendant of focusNode
    let ancestor: ProjectNode | undefined = sel;
    let isUnderFocus = false;
    while (ancestor) {
      if (ancestor.id === focusNode.id) {
        isUnderFocus = true;
        break;
      }
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
    if (isUnderFocus) {
      // Include sel and all ancestors up to focusNode
      let chainNode: ProjectNode | undefined = sel;
      while (chainNode && chainNode.id !== focusNode.id) {
        visibleNodesSet.add(chainNode);
        chainNode = chainNode.parentId ? byId.get(chainNode.parentId) : undefined;
      }
    }
  }

  const visibleNodes = Array.from(visibleNodesSet);
  const visibleNodesMap = new Map(visibleNodes.map((n) => [n.id, n]));

  // 5. Overflow Aggregates
  const overflowNodes: ViewportOverflowNode[] = [];

  // Focus direct children overflow: split into folders and files count for truthful messaging
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
      position2D: { x: 0, y: 0, angle: 0 }, // Assigned in coordinate pass
      position3D: [0, 0, 0], // Assigned in coordinate pass
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

  // 6. Deterministic 2D & 3D Coordinates
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

  // 3D base radius
  const base3DRadius = Math.max(3.2, 2.6 * Math.sqrt(Math.max(1, directCount) * 0.18) + 2.2);

  visibleDirectChildrenList.forEach((child, i) => {
    const angle = (i / Math.max(1, directCount)) * Math.PI * 2 - Math.PI / 2;
    const x2D = Math.cos(angle) * base2DRadius;
    const y2D = Math.sin(angle) * base2DRadius;
    positions2D.set(child.id, { x: x2D, y: y2D, angle });

    // 3D Golden-angle staircase around central focus
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

          // 3D local spiral around parent
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

  // 7. Hierarchy Edges
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

  // 8. Adaptive Dependency Edges
  const visibleDependencyEdges: ViewportDependencyEdge[] = [];
  let totalDependenciesInScope = 0;
  let dependencyDensityCapped = false;

  const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';

  if (showDependencies && project.dependencies?.edges) {
    const pathToId = new Map<string, string>();
    for (const n of project.nodes) {
      pathToId.set(n.path, n.id);
    }

    const inScopeEdges: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];

    for (const edge of project.dependencies.edges) {
      if (!edge.isExternal && edge.isResolved) {
        const sId = pathToId.get(edge.sourcePath);
        const tId = pathToId.get(edge.targetResolvedPath ?? edge.targetPath);
        if (sId && tId && sId !== tId) {
          // Check if both endpoints are in visibleNodes
          if (visibleNodesMap.has(sId) && visibleNodesMap.has(tId)) {
            inScopeEdges.push({ edge, sId, tId });
          }
        }
      }
    }

    totalDependenciesInScope = inScopeEdges.length;

    if (totalDependenciesInScope > MAX_VISIBLE_DEPENDENCY_EDGES) {
      dependencyDensityCapped = true;
      // High-density filter (Section 13): Prioritize dependencies touching selectedNodeId, hoveredNodeId, or focusNode
      const priorityIds = new Set<string>();
      if (selectedNodeId) priorityIds.add(selectedNodeId);
      if (hoveredNodeId) priorityIds.add(hoveredNodeId);
      priorityIds.add(focusNode.id);

      const prioritized: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];
      const remainder: Array<{ edge: DependencyEdge; sId: string; tId: string }> = [];

      for (const item of inScopeEdges) {
        if (priorityIds.has(item.sId) || priorityIds.has(item.tId)) {
          prioritized.push(item);
        } else {
          remainder.push(item);
        }
      }

      const capped = [...prioritized, ...remainder].slice(0, MAX_VISIBLE_DEPENDENCY_EDGES);
      for (const { edge, sId, tId } of capped) {
        visibleDependencyEdges.push({
          id: `dep-${edge.id}`,
          sourceId: sId,
          targetId: tId,
          edge,
        });
      }
    } else {
      for (const { edge, sId, tId } of inScopeEdges) {
        visibleDependencyEdges.push({
          id: `dep-${edge.id}`,
          sourceId: sId,
          targetId: tId,
          edge,
        });
      }
    }
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
    visibleDependencyEdges,
    totalDirectChildren,
    visibleDirectChildren: visibleDirectChildrenList.length,
    hiddenDirectChildren,
    totalDependenciesInScope,
    visibleDependenciesCount: visibleDependencyEdges.length,
    dependencyDensityCapped,
  };
}
