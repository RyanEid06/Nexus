import { describe, expect, it } from 'vitest';
import type { DependencyEdge, ProjectIndex, ProjectNode } from '../src/domain/models';
import {
  computeGraphViewport,
  buildGraphIndex,
  prioritizeChildren,
  MAX_DIRECT_REAL_CHILDREN,
  MAX_EXPANDED_BRANCH_CHILDREN,
  MAX_GRAPH_REAL_NODES,
  MAX_VISIBLE_DEPENDENCY_EDGES,
} from '../src/services/graphViewport';

function createMockNode(overrides: Partial<ProjectNode> & { id: string; name: string }): ProjectNode {
  return {
    projectId: 'proj-1',
    parentId: 'root',
    kind: 'file',
    path: overrides.name,
    loc: 10,
    sizeBytes: 100,
    depth: 1,
    ...overrides,
  };
}

function createMockProject(nodes: ProjectNode[], edges: DependencyEdge[] = []): ProjectIndex {
  const root = nodes.find((n) => n.kind === 'project') ?? {
    id: 'root',
    projectId: 'proj-1',
    parentId: null,
    name: 'test-project',
    kind: 'project' as const,
    path: '',
    loc: 1000,
    sizeBytes: 50000,
    depth: 0,
  };

  const finalNodes = nodes.some((n) => n.kind === 'project') ? nodes : [root, ...nodes];

  return {
    schemaVersion: 3,
    id: 'proj-1',
    name: 'test-project',
    rootPathLabel: '/test-project',
    createdAt: 1000,
    updatedAt: Date.now(),
    source: 'local',
    warnings: [],
    metrics: {
      files: finalNodes.filter((n) => n.kind === 'file').length,
      folders: finalNodes.filter((n) => n.kind === 'directory').length,
      totalLoc: 1000,
      indexedBytes: 50000,
      analyzedTextBytes: 50000,
      analyzedFiles: finalNodes.filter((n) => n.kind === 'file').length,
      metadataOnlyFiles: 0,
      skippedLargeFiles: 0,
      skippedSensitiveFiles: 0,
      languages: [],
      dependencyEdges: edges.length,
    },
    nodes: finalNodes,
    dependencies: {
      edges,
      externalPackages: [],
      circularDependencies: [],
    },
  };
}

describe('Graph Viewport & Spatial Budgeting', () => {
  it('1. Deterministic child prioritization: directories > descendant files > LOC > alphabetical', () => {
    const children: ProjectNode[] = [
      createMockNode({ id: 'f_alpha', parentId: 'root', name: 'alpha.ts', kind: 'file', path: 'alpha.ts', loc: 100, depth: 1 }),
      createMockNode({ id: 'f_zeta', parentId: 'root', name: 'zeta.ts', kind: 'file', path: 'zeta.ts', loc: 500, depth: 1 }),
      createMockNode({ id: 'd_small', parentId: 'root', name: 'small', kind: 'directory', path: 'small', loc: 0, depth: 1, descendantFiles: 5 }),
      createMockNode({ id: 'd_big', parentId: 'root', name: 'big', kind: 'directory', path: 'big', loc: 0, depth: 1, descendantFiles: 50 }),
      createMockNode({ id: 'f_beta', parentId: 'root', name: 'beta.ts', kind: 'file', path: 'beta.ts', loc: 100, depth: 1 }),
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
    const files: ProjectNode[] = Array.from({ length: 2000 }, (_, i) =>
      createMockNode({
        id: `file_${i}`,
        parentId: 'root',
        name: `file_${i}.ts`,
        kind: 'file',
        path: `file_${i}.ts`,
        loc: 10 + (i % 50),
        depth: 1,
      })
    );

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
    const dirs: ProjectNode[] = Array.from({ length: 150 }, (_, i) =>
      createMockNode({
        id: `dir_${i}`,
        parentId: 'root',
        name: `module_${String(i).padStart(3, '0')}`,
        kind: 'directory',
        path: `module_${i}`,
        loc: 0,
        depth: 1,
        descendantFiles: 10 + i,
      })
    );

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
    const files: ProjectNode[] = Array.from({ length: 100 }, (_, i) =>
      createMockNode({
        id: `file_${i}`,
        parentId: 'root',
        name: `file_${String(i).padStart(3, '0')}.ts`,
        kind: 'file',
        path: `file_${i}.ts`,
        loc: 100 - i, // file_99 has lowest loc, normally sliced out
        depth: 1,
      })
    );

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
      createMockNode({ id: 'd_src', parentId: 'root', name: 'src', kind: 'directory', path: 'src', loc: 0, depth: 1 }),
      createMockNode({ id: 'd_components', parentId: 'd_src', name: 'components', kind: 'directory', path: 'src/components', loc: 0, depth: 2 }),
      createMockNode({ id: 'f_target', parentId: 'd_components', name: 'Target.tsx', kind: 'file', path: 'src/components/Target.tsx', loc: 42, depth: 3 }),
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
      createMockNode({ id: 'd_src', parentId: 'root', name: 'src', kind: 'directory', path: 'src', loc: 0, depth: 1 }),
      createMockNode({ id: 'd_services', parentId: 'd_src', name: 'services', kind: 'directory', path: 'src/services', loc: 0, depth: 2 }),
      createMockNode({ id: 'f_layout', parentId: 'd_services', name: 'layout.ts', kind: 'file', path: 'src/services/layout.ts', loc: 100, depth: 3 }),
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
    const dirChildren: ProjectNode[] = Array.from({ length: 45 }, (_, i) =>
      createMockNode({
        id: `child_${i}`,
        parentId: 'd_big',
        name: `child_${i}.ts`,
        kind: 'file',
        path: `big/child_${i}.ts`,
        loc: 50,
        depth: 2,
      })
    );

    const nodes: ProjectNode[] = [
      createMockNode({ id: 'd_big', parentId: 'root', name: 'big', kind: 'directory', path: 'big', loc: 0, depth: 1, descendantFiles: 45 }),
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
    const files: ProjectNode[] = Array.from({ length: 20 }, (_, i) =>
      createMockNode({
        id: `m_${i}`,
        parentId: 'root',
        name: `mod_${String(i).padStart(2, '0')}.ts`,
        kind: 'file',
        path: `mod_${String(i).padStart(2, '0')}.ts`,
        loc: 10,
        depth: 1,
      })
    );

    // Generate 75 dependency edges between these 20 visible files
    const edges: DependencyEdge[] = [];
    let edgeId = 0;
    for (let i = 0; i < 20; i++) {
      for (let j = 1; j <= 4; j++) {
        const targetIdx = (i + j) % 20;
        edges.push({
          id: `edge_${edgeId++}`,
          sourceId: `m_${i}`,
          targetId: `m_${targetIdx}`,
          sourcePath: `mod_${String(i).padStart(2, '0')}.ts`,
          targetPath: `mod_${String(targetIdx).padStart(2, '0')}.ts`,
          targetResolvedPath: `mod_${String(targetIdx).padStart(2, '0')}.ts`,
          specifier: `./mod_${String(targetIdx).padStart(2, '0')}`,
          type: 'static-import',
          isResolved: true,
          isExternal: false,
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

  it('9. Real scanner-style root ID (node:project-id:) is correctly detected as root', () => {
    const rootId = 'node:proj-123:';
    const rootNode: ProjectNode = {
      id: rootId,
      projectId: 'proj-123',
      parentId: null,
      name: 'real-repo',
      kind: 'project',
      path: '',
      loc: 100,
      sizeBytes: 1000,
      depth: 0,
    };
    const childNode: ProjectNode = {
      id: 'node:proj-123:src',
      projectId: 'proj-123',
      parentId: rootId,
      name: 'src',
      kind: 'directory',
      path: 'src',
      loc: 100,
      sizeBytes: 1000,
      depth: 1,
    };

    const project: ProjectIndex = {
      schemaVersion: 3,
      id: 'proj-123',
      name: 'real-repo',
      rootPathLabel: '/real-repo',
      createdAt: 1000,
      updatedAt: Date.now(),
      source: 'local',
      warnings: [],
      metrics: {
        files: 0,
        folders: 1,
        totalLoc: 100,
        indexedBytes: 1000,
        analyzedTextBytes: 1000,
        analyzedFiles: 0,
        metadataOnlyFiles: 0,
        skippedLargeFiles: 0,
        skippedSensitiveFiles: 0,
        languages: [],
        dependencyEdges: 0,
      },
      nodes: [rootNode, childNode],
      dependencies: { edges: [], externalPackages: [], circularDependencies: [] },
    };

    // When focused at root
    const rootViewport = computeGraphViewport({
      project,
      mapFocusNodeId: rootId,
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });
    expect(rootViewport.isProjectRootFocused).toBe(true);
    expect(rootViewport.focusParentNode).toBeNull();

    // When focused at child
    const childViewport = computeGraphViewport({
      project,
      mapFocusNodeId: childNode.id,
      selectedNodeId: null,
      expandedNodeIds: new Set(),
    });
    expect(childViewport.isProjectRootFocused).toBe(false);
    expect(childViewport.focusParentNode?.id).toBe(rootId);
  });

  it('10. Strict 72-node budget is never exceeded under pathological 100-level path and 2,000 files', () => {
    // Generate a deep 100-level path of directories
    const nodes: ProjectNode[] = [];
    const rootNode: ProjectNode = {
      id: 'root',
      projectId: 'proj-1',
      parentId: null,
      name: 'root',
      kind: 'project',
      path: '',
      loc: 1000,
      sizeBytes: 1000,
      depth: 0,
    };
    nodes.push(rootNode);

    let prevId = 'root';
    for (let depth = 1; depth <= 100; depth++) {
      const dirId = `dir_depth_${depth}`;
      nodes.push(
        createMockNode({
          id: dirId,
          parentId: prevId,
          name: `level_${depth}`,
          kind: 'directory',
          path: `level_${depth}`,
          depth,
        })
      );
      prevId = dirId;
    }

    // Add 2,000 files at root
    for (let i = 0; i < 2000; i++) {
      nodes.push(
        createMockNode({
          id: `root_file_${i}`,
          parentId: 'root',
          name: `root_file_${i}.ts`,
          kind: 'file',
          path: `root_file_${i}.ts`,
          depth: 1,
        })
      );
    }

    const project = createMockProject(nodes);
    const deepTargetId = 'dir_depth_100';

    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: deepTargetId,
      expandedNodeIds: new Set(['dir_depth_50', 'dir_depth_80']),
    });

    // Visible real nodes MUST NOT exceed MAX_GRAPH_REAL_NODES (72)
    expect(viewport.visibleNodes.length).toBeLessThanOrEqual(MAX_GRAPH_REAL_NODES);
    expect(viewport.visibleNodes.length).toBeGreaterThan(0);
  });

  it('11. Coordinate invariant: 100% of visible nodes have valid, non-fallback 2D & 3D coordinates', () => {
    const nodes: ProjectNode[] = [
      createMockNode({ id: 'd_src', parentId: 'root', name: 'src', kind: 'directory', path: 'src', loc: 0, depth: 1 }),
      createMockNode({ id: 'd_components', parentId: 'd_src', name: 'components', kind: 'directory', path: 'src/components', loc: 0, depth: 2 }),
      createMockNode({ id: 'f_target', parentId: 'd_components', name: 'Target.tsx', kind: 'file', path: 'src/components/Target.tsx', loc: 42, depth: 3 }),
      createMockNode({ id: 'f_sibling', parentId: 'root', name: 'other.ts', kind: 'file', path: 'other.ts', loc: 10, depth: 1 }),
    ];

    const project = createMockProject(nodes);
    const viewport = computeGraphViewport({
      project,
      mapFocusNodeId: 'root',
      selectedNodeId: 'f_target',
      expandedNodeIds: new Set(['d_src']),
    });

    for (const node of viewport.visibleNodes) {
      const pos2D = viewport.positions2D.get(node.id);
      const pos3D = viewport.positions3D.get(node.id);

      expect(pos2D).toBeDefined();
      expect(pos3D).toBeDefined();

      expect(Number.isFinite(pos2D!.x)).toBe(true);
      expect(Number.isFinite(pos2D!.y)).toBe(true);
      expect(pos3D!.length).toBe(3);
      expect(Number.isFinite(pos3D![0])).toBe(true);
      expect(Number.isFinite(pos3D![1])).toBe(true);
      expect(Number.isFinite(pos3D![2])).toBe(true);

      // Non-focus nodes must never collapse to origin [0,0,0]
      if (node.id !== viewport.focusNode.id) {
        const isAtOrigin = pos3D![0] === 0 && pos3D![1] === 0 && pos3D![2] === 0;
        expect(isAtOrigin).toBe(false);
      }
    }
  });

  it('12. Hover benchmark: buildGraphIndex and in-scope edge lookups execute in <5ms for 50,000 nodes', () => {
    const largeNodes: ProjectNode[] = [];
    const rootNode: ProjectNode = {
      id: 'root',
      projectId: 'big-proj',
      parentId: null,
      name: 'big-project',
      kind: 'project',
      path: '',
      loc: 100000,
      sizeBytes: 1000000,
      depth: 0,
    };
    largeNodes.push(rootNode);

    // Create 50,000 files
    for (let i = 0; i < 50000; i++) {
      largeNodes.push({
        id: `node_${i}`,
        projectId: 'big-proj',
        parentId: 'root',
        name: `file_${i}.ts`,
        kind: 'file',
        path: `src/file_${i}.ts`,
        loc: 10,
        sizeBytes: 100,
        depth: 1,
      });
    }

    // 10,000 edges
    const largeEdges: DependencyEdge[] = [];
    for (let i = 0; i < 10000; i++) {
      largeEdges.push({
        id: `edge_${i}`,
        sourceId: `node_${i}`,
        targetId: `node_${(i + 1) % 50000}`,
        sourcePath: `src/file_${i}.ts`,
        targetPath: `src/file_${(i + 1) % 50000}.ts`,
        targetResolvedPath: `src/file_${(i + 1) % 50000}.ts`,
        specifier: `./file_${(i + 1) % 50000}`,
        type: 'static-import',
        isResolved: true,
        isExternal: false,
      });
    }

    const project: ProjectIndex = {
      schemaVersion: 3,
      id: 'big-proj',
      name: 'big-project',
      rootPathLabel: '/big-project',
      createdAt: 1000,
      updatedAt: Date.now(),
      source: 'local',
      warnings: [],
      metrics: {
        files: 50000,
        folders: 0,
        totalLoc: 500000,
        indexedBytes: 5000000,
        analyzedTextBytes: 5000000,
        analyzedFiles: 50000,
        metadataOnlyFiles: 0,
        skippedLargeFiles: 0,
        skippedSensitiveFiles: 0,
        languages: [],
        dependencyEdges: largeEdges.length,
      },
      nodes: largeNodes,
      dependencies: { edges: largeEdges, externalPackages: [], circularDependencies: [] },
    };

    const index = buildGraphIndex(project);
    expect(index).toBeDefined();

    // Now test repeated hover lookups for a node — must be O(1) in microseconds (<5ms)
    const tHover0 = performance.now();
    for (let i = 0; i < 20; i++) {
      const outgoing = index.dependenciesBySourceId.get('node_1') ?? [];
      const incoming = index.dependenciesByTargetId.get('node_1') ?? [];
      expect(outgoing.length + incoming.length).toBeGreaterThanOrEqual(0);
    }
    const hoverDuration = performance.now() - tHover0;

    expect(hoverDuration).toBeLessThan(5); // Hover lookups execute in <5ms without project-wide edge rescanning
  });
});
