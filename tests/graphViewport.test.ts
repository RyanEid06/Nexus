import { describe, expect, it } from 'vitest';
import type { DependencyEdge, ProjectIndex, ProjectNode } from '../src/domain/models';
import {
  computeGraphViewport,
  prioritizeChildren,
  MAX_DIRECT_REAL_CHILDREN,
  MAX_EXPANDED_BRANCH_CHILDREN,
  MAX_GRAPH_REAL_NODES,
  MAX_VISIBLE_DEPENDENCY_EDGES,
} from '../src/services/graphViewport';

function createMockProject(nodes: ProjectNode[], edges: DependencyEdge[] = []): ProjectIndex {
  const root = nodes.find((n) => n.kind === 'project') ?? {
    id: 'root',
    parentId: null,
    name: 'test-project',
    kind: 'project',
    path: '',
    loc: 1000,
    depth: 0,
  };

  const finalNodes = nodes.some((n) => n.kind === 'project') ? nodes : [root, ...nodes];

  return {
    id: 'proj-1',
    name: 'test-project',
    rootPath: '/test-project',
    updatedAt: Date.now(),
    metrics: {
      files: finalNodes.filter((n) => n.kind === 'file').length,
      directories: finalNodes.filter((n) => n.kind === 'directory').length,
      totalLoc: 1000,
      indexedBytes: 50000,
      safetySkips: 0,
    },
    nodes: finalNodes,
    dependencies: {
      edges,
      externalPackages: [],
      circularGroups: [],
    },
  };
}

describe('Graph Viewport & Spatial Budgeting', () => {
  it('1. Deterministic child prioritization: directories > descendant files > LOC > alphabetical', () => {
    const children: ProjectNode[] = [
      { id: 'f_alpha', parentId: 'root', name: 'alpha.ts', kind: 'file', path: 'alpha.ts', loc: 100, depth: 1 },
      { id: 'f_zeta', parentId: 'root', name: 'zeta.ts', kind: 'file', path: 'zeta.ts', loc: 500, depth: 1 },
      { id: 'd_small', parentId: 'root', name: 'small', kind: 'directory', path: 'small', loc: 0, depth: 1, descendantFiles: 5 },
      { id: 'd_big', parentId: 'root', name: 'big', kind: 'directory', path: 'big', loc: 0, depth: 1, descendantFiles: 50 },
      { id: 'f_beta', parentId: 'root', name: 'beta.ts', kind: 'file', path: 'beta.ts', loc: 100, depth: 1 },
    ];

    const sorted = prioritizeChildren(children);

    // Directories first, ordered by descendant files
    expect(sorted[0].id).toBe('d_big');
    expect(sorted[1].id).toBe('d_small');
    // Files next, ordered by LOC descending
    expect(sorted[2].id).toBe('f_zeta');
    // Files with same LOC ordered alphabetically
    expect(sorted[3].id).toBe('f_alpha');
    expect(sorted[4].id).toBe('f_beta');
  });

  it('2. Pathological 2,000 files under root: strict budget caps at MAX_DIRECT_REAL_CHILDREN (24) + 1 overflow node', () => {
    const files: ProjectNode[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `file_${i}`,
      parentId: 'root',
      name: `file_${i}.ts`,
      kind: 'file' as const,
      path: `file_${i}.ts`,
      loc: 10 + (i % 50),
      depth: 1,
    }));

    const project = createMockProject(files);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });

    // Root + 24 visible direct file children = 25 real nodes
    expect(viewport.visibleDirectChildren).toBe(MAX_DIRECT_REAL_CHILDREN);
    expect(viewport.visibleNodes.length).toBe(MAX_DIRECT_REAL_CHILDREN + 1);

    // Exactly 1 direct overflow node
    expect(viewport.overflowNodes.length).toBe(1);
    const overflow = viewport.overflowNodes[0];
    expect(overflow.parentId).toBe('root');
    expect(overflow.hiddenCount).toBe(2000 - MAX_DIRECT_REAL_CHILDREN);
    expect(overflow.totalChildrenCount).toBe(2000);
    expect(overflow.label).toContain(`+ ${(2000 - MAX_DIRECT_REAL_CHILDREN).toLocaleString()} more files`);
  });

  it('3. Pathological 150 directories under root: strict budget caps at 24 real directories + 1 overflow node', () => {
    const dirs: ProjectNode[] = Array.from({ length: 150 }, (_, i) => ({
      id: `dir_${i}`,
      parentId: 'root',
      name: `module_${String(i).padStart(3, '0')}`,
      kind: 'directory' as const,
      path: `module_${i}`,
      loc: 0,
      depth: 1,
      descendantFiles: 10 + i,
    }));

    const project = createMockProject(dirs);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });

    expect(viewport.visibleDirectChildren).toBe(MAX_DIRECT_REAL_CHILDREN);
    expect(viewport.overflowNodes.length).toBe(1);
    expect(viewport.overflowNodes[0].hiddenCount).toBe(150 - MAX_DIRECT_REAL_CHILDREN);
    expect(viewport.overflowNodes[0].label).toContain(`+ ${(150 - MAX_DIRECT_REAL_CHILDREN).toLocaleString()} more folders`);
  });

  it('4. Selected node retention: selected child outside top 24 is preserved and included', () => {
    const files: ProjectNode[] = Array.from({ length: 100 }, (_, i) => ({
      id: `file_${i}`,
      parentId: 'root',
      name: `file_${String(i).padStart(3, '0')}.ts`,
      kind: 'file' as const,
      path: `file_${i}.ts`,
      loc: 100 - i, // file_99 has lowest loc, normally sliced out
      depth: 1,
    }));

    const project = createMockProject(files);
    const selectedId = 'file_99';

    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: selectedId,
      expandedNodeIds: new Set(),
    });

    expect(viewport.visibleNodesMap.has(selectedId)).toBe(true);
    expect(viewport.visibleDirectChildren).toBe(MAX_DIRECT_REAL_CHILDREN);
  });

  it('5. Selected node deep in subfolder: includes selected node and ancestors up to focusNode', () => {
    const nodes: ProjectNode[] = [
      { id: 'd_src', parentId: 'root', name: 'src', kind: 'directory', path: 'src', loc: 0, depth: 1 },
      { id: 'd_components', parentId: 'd_src', name: 'components', kind: 'directory', path: 'src/components', loc: 0, depth: 2 },
      { id: 'f_target', parentId: 'd_components', name: 'Target.tsx', kind: 'file', path: 'src/components/Target.tsx', loc: 42, depth: 3 },
    ];

    const project = createMockProject(nodes);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: 'f_target',
      expandedNodeIds: new Set(['d_src']),
    });

    expect(viewport.visibleNodesMap.has('d_src')).toBe(true);
    expect(viewport.visibleNodesMap.has('d_components')).toBe(true);
    expect(viewport.visibleNodesMap.has('f_target')).toBe(true);
  });

  it('6. Focus navigation and breadcrumb trail from root down to focusNode', () => {
    const nodes: ProjectNode[] = [
      { id: 'd_src', parentId: 'root', name: 'src', kind: 'directory', path: 'src', loc: 0, depth: 1 },
      { id: 'd_services', parentId: 'd_src', name: 'services', kind: 'directory', path: 'src/services', loc: 0, depth: 2 },
      { id: 'f_layout', parentId: 'd_services', name: 'layout.ts', kind: 'file', path: 'src/services/layout.ts', loc: 100, depth: 3 },
    ];

    const project = createMockProject(nodes);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'd_services',
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });

    expect(viewport.focusNode.id).toBe('d_services');
    expect(viewport.isProjectRootFocused).toBe(false);
    expect(viewport.focusParentNode?.id).toBe('d_src');

    // Breadcrumb trail: Root -> src -> services
    expect(viewport.breadcrumbTrail.map((n) => n.id)).toEqual(['root', 'd_src', 'd_services']);

    // Direct children of focused directory 'd_services'
    expect(viewport.visibleDirectChildren).toBe(1);
    expect(viewport.visibleNodesMap.has('f_layout')).toBe(true);
  });

  it('7. Expanded branch children are capped at MAX_EXPANDED_BRANCH_CHILDREN (20) with branch overflow indicator', () => {
    const dirChildren: ProjectNode[] = Array.from({ length: 45 }, (_, i) => ({
      id: `child_${i}`,
      parentId: 'd_big',
      name: `child_${i}.ts`,
      kind: 'file' as const,
      path: `big/child_${i}.ts`,
      loc: 50,
      depth: 2,
    }));

    const nodes: ProjectNode[] = [
      { id: 'd_big', parentId: 'root', name: 'big', kind: 'directory', path: 'big', loc: 0, depth: 1, descendantFiles: 45 },
      ...dirChildren,
    ];

    const project = createMockProject(nodes);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: null,
      expandedNodeIds: new Set(['d_big']),
    });

    const branchOverflow = viewport.overflowNodes.find((o) => o.parentId === 'd_big');
    expect(branchOverflow).toBeDefined();
    expect(branchOverflow!.hiddenCount).toBe(45 - MAX_EXPANDED_BRANCH_CHILDREN);
    expect(branchOverflow!.totalChildrenCount).toBe(45);
  });

  it('8. High-density dependency cap at MAX_VISIBLE_DEPENDENCY_EDGES (60) with priority preservation', () => {
    // 20 files (all within MAX_DIRECT_REAL_CHILDREN budget of 24)
    const files: ProjectNode[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m_${i}`,
      parentId: 'root',
      name: `mod_${String(i).padStart(2, '0')}.ts`,
      kind: 'file' as const,
      path: `mod_${String(i).padStart(2, '0')}.ts`,
      loc: 10,
      depth: 1,
    }));

    // Generate 75 dependency edges between these 20 visible files
    const edges: DependencyEdge[] = [];
    let edgeId = 0;
    for (let i = 0; i < 20; i++) {
      for (let j = 1; j <= 4; j++) {
        const targetIdx = (i + j) % 20;
        edges.push({
          id: `edge_${edgeId++}`,
          sourcePath: `mod_${String(i).padStart(2, '0')}.ts`,
          targetPath: `mod_${String(targetIdx).padStart(2, '0')}.ts`,
          targetResolvedPath: `mod_${String(targetIdx).padStart(2, '0')}.ts`,
          specifier: `./mod_${String(targetIdx).padStart(2, '0')}`,
          isResolved: true,
          isExternal: false,
          kind: 'static-import',
        });
      }
    }

    const project = createMockProject(files, edges);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: 'm_0',
      expandedNodeIds: new Set(),
      relationshipMode: 'dependencies',
    });

    expect(viewport.dependencyDensityCapped).toBe(true);
    expect(viewport.visibleDependencyEdges.length).toBeLessThanOrEqual(MAX_VISIBLE_DEPENDENCY_EDGES);

    // Edges touching selectedNode 'm_0' must be prioritized
    const touchesSelected = viewport.visibleDependencyEdges.some(
      (e) => e.sourceId === 'm_0' || e.targetId === 'm_0'
    );
    expect(touchesSelected).toBe(true);
  });

  it('9. Normal small project: all nodes rendered without overflow nodes', () => {
    const files: ProjectNode[] = [
      { id: 'f_main', parentId: 'root', name: 'main.ts', kind: 'file', path: 'main.ts', loc: 50, depth: 1 },
      { id: 'f_app', parentId: 'root', name: 'App.tsx', kind: 'file', path: 'App.tsx', loc: 80, depth: 1 },
    ];
    const project = createMockProject(files);

    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });

    expect(viewport.visibleNodes.length).toBe(3); // root + 2 files
    expect(viewport.overflowNodes.length).toBe(0);
    expect(viewport.hiddenDirectChildren).toBe(0);
  });

  it('10. 2D & 3D Coordinates: Center focus node at origin (0, 0) and (0, 0, 0)', () => {
    const files: ProjectNode[] = [
      { id: 'f_1', parentId: 'root', name: 'f1.ts', kind: 'file', path: 'f1.ts', loc: 10, depth: 1 },
    ];
    const project = createMockProject(files);

    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });

    const root2D = viewport.positions2D.get('root');
    const root3D = viewport.positions3D.get('root');

    expect(root2D).toEqual({ x: 0, y: 0, angle: 0 });
    expect(root3D).toEqual([0, 0, 0]);

    const child2D = viewport.positions2D.get('f_1');
    const child3D = viewport.positions3D.get('f_1');
    expect(child2D).toBeDefined();
    expect(child3D).toBeDefined();
    expect(child2D!.x !== 0 || child2D!.y !== 0).toBe(true);
    expect(child3D![1]).toBeLessThan(0); // negative vertical staircase lift
  });
});
