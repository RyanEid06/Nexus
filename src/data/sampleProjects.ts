import type { DependencyEdge, DependencyGraphData, ProjectIndex, ProjectNode } from '../domain/models';
import { aggregateDirectoryStats, calculateMetrics } from '../services/metrics';
import { withDeterministicLayout } from '../services/layout';
import { demoProject } from './demoProject';

type RawTuple = [string, string | null, string, ProjectNode['kind'], number, number, string?];

function buildCuratedProject(
  id: string,
  name: string,
  raw: RawTuple[],
  edgeSpecs: Array<{
    id: string;
    sourceId: string;
    targetId?: string;
    targetPath?: string;
    specifier: string;
    isExternal?: boolean;
  }>,
  circularDependencies: string[][],
  externalPackages: string[],
  daysAgo: number
): ProjectIndex {
  const byTupleId = new Map(raw.map((entry) => [entry[0], entry]));

  const pathOf = (nodeId: string): string => {
    const item = byTupleId.get(nodeId);
    if (!item || !item[1]) return '';
    const parentPath = pathOf(item[1]);
    return parentPath ? `${parentPath}/${item[2]}` : item[2];
  };

  const depthOf = (nodeId: string): number => {
    const pth = pathOf(nodeId);
    return pth ? pth.split('/').length : 0;
  };

  const baseTime = Date.UTC(2026, 10, 14, 15, 0, 0) - daysAgo * 86_400_000;

  const rawNodes: ProjectNode[] = raw.map(([nodeId, parentId, nodeName, kind, sizeBytes, loc, language], index) => ({
    id: nodeId,
    projectId: id,
    parentId,
    name: nodeName,
    path: pathOf(nodeId),
    kind,
    sizeBytes,
    loc,
    language,
    extension: kind === 'file' ? nodeName.split('.').pop() : undefined,
    depth: depthOf(nodeId),
    modifiedAt: kind === 'file' ? baseTime - index * 2_400_000 : undefined,
    analysisStatus: kind === 'file' ? 'analyzed' : undefined,
  }));

  const edges: DependencyEdge[] = edgeSpecs.map((spec) => {
    const src = rawNodes.find((n) => n.id === spec.sourceId);
    const tgt = spec.targetId ? rawNodes.find((n) => n.id === spec.targetId) : undefined;
    return {
      id: spec.id,
      sourceId: spec.sourceId,
      sourcePath: src?.path ?? '',
      targetId: spec.targetId,
      targetPath: tgt?.path ?? spec.targetPath ?? spec.specifier,
      targetResolvedPath: tgt?.path,
      specifier: spec.specifier,
      type: 'static-import',
      isExternal: Boolean(spec.isExternal),
      isResolved: true,
    };
  });

  const outgoingCounts = new Map<string, number>();
  const incomingCounts = new Map<string, number>();
  for (const edge of edges) {
    if (!edge.isExternal && edge.isResolved) {
      outgoingCounts.set(edge.sourceId, (outgoingCounts.get(edge.sourceId) ?? 0) + 1);
      if (edge.targetId) {
        incomingCounts.set(edge.targetId, (incomingCounts.get(edge.targetId) ?? 0) + 1);
      }
    }
  }

  for (const node of rawNodes) {
    node.outgoingCount = outgoingCounts.get(node.id) ?? 0;
    node.incomingCount = incomingCounts.get(node.id) ?? 0;
  }

  const laidOutNodes = withDeterministicLayout(aggregateDirectoryStats(rawNodes));
  const metrics = calculateMetrics(laidOutNodes);
  metrics.dependencyEdges = edges.filter((e) => !e.isExternal && e.isResolved).length;
  metrics.externalPackagesCount = externalPackages.length;
  metrics.circularDependenciesCount = circularDependencies.length;

  const dependencies: DependencyGraphData = {
    edges,
    circularDependencies,
    circularCycles: circularDependencies,
    externalPackages,
  };

  return {
    schemaVersion: 3,
    id,
    name,
    rootPathLabel: name,
    createdAt: baseTime - 7 * 86_400_000,
    updatedAt: baseTime,
    source: 'demo',
    nodes: laidOutNodes,
    metrics,
    warnings: [],
    dependencies,
    analysisConfig: {
      selectedCategories: ['source', 'configuration', 'documentation', 'test'],
      maxTextFileBytes: 2 * 1024 * 1024,
      maxEntries: 50_000,
      scannerAnalysisVersion: 2,
      dependencyParserVersion: 2,
      dependencyResolverVersion: 2,
    },
  };
}

export const heliosProject: ProjectIndex = buildCuratedProject(
  'demo-helios',
  'Helios Engine',
  [
    ['helios-root', null, 'Helios Engine', 'project', 0, 0],
    ['h-core', 'helios-root', 'core', 'directory', 0, 0],
    ['h-render', 'helios-root', 'renderer', 'directory', 0, 0],
    ['h-physics', 'helios-root', 'physics', 'directory', 0, 0],
    ['h-shaders', 'helios-root', 'shaders', 'directory', 0, 0],
    ['h-tests', 'helios-root', 'tests', 'directory', 0, 0],
    ['h-engine', 'h-core', 'Engine.ts', 'file', 16400, 498, 'TypeScript'],
    ['h-scheduler', 'h-core', 'FrameScheduler.ts', 'file', 9400, 276, 'TypeScript'],
    ['h-ecs', 'h-core', 'EntityRegistry.ts', 'file', 13200, 384, 'TypeScript'],
    ['h-scene', 'h-render', 'ScenePipeline.ts', 'file', 21500, 650, 'TypeScript'],
    ['h-camera', 'h-render', 'CameraRig.ts', 'file', 8900, 245, 'TypeScript'],
    ['h-instancing', 'h-render', 'InstanceBatch.ts', 'file', 11800, 338, 'TypeScript'],
    ['h-broadphase', 'h-physics', 'BroadphaseGrid.ts', 'file', 10200, 312, 'TypeScript'],
    ['h-solver', 'h-physics', 'ConstraintSolver.ts', 'file', 14800, 442, 'TypeScript'],
    ['h-pbr', 'h-shaders', 'pbr.frag', 'file', 5200, 165, 'GLSL'],
    ['h-test-ecs', 'h-tests', 'scheduler.test.ts', 'file', 6100, 184, 'TypeScript'],
  ],
  [
    { id: 'he1', sourceId: 'h-engine', targetId: 'h-scheduler', specifier: './FrameScheduler' },
    { id: 'he2', sourceId: 'h-engine', targetId: 'h-scene', specifier: '../renderer/ScenePipeline' },
    { id: 'he3', sourceId: 'h-engine', targetId: 'h-broadphase', specifier: '../physics/BroadphaseGrid' },
    { id: 'he4', sourceId: 'h-scheduler', targetId: 'h-ecs', specifier: './EntityRegistry' },
    { id: 'he5', sourceId: 'h-ecs', targetId: 'h-scheduler', specifier: './FrameScheduler' },
    { id: 'he6', sourceId: 'h-scene', targetId: 'h-camera', specifier: './CameraRig' },
    { id: 'he7', sourceId: 'h-scene', targetId: 'h-instancing', specifier: './InstanceBatch' },
    { id: 'he8', sourceId: 'h-scene', targetPath: 'three', specifier: 'three', isExternal: true },
    { id: 'he9', sourceId: 'h-broadphase', targetId: 'h-solver', specifier: './ConstraintSolver' },
    { id: 'he10', sourceId: 'h-solver', targetId: 'h-ecs', specifier: '../core/EntityRegistry' },
    { id: 'he11', sourceId: 'h-test-ecs', targetId: 'h-scheduler', specifier: '../core/FrameScheduler' },
    { id: 'he12', sourceId: 'h-test-ecs', targetPath: 'vitest', specifier: 'vitest', isExternal: true },
  ],
  [['core/FrameScheduler.ts', 'core/EntityRegistry.ts']],
  ['three', 'vitest'],
  1
);

export const vortexProject: ProjectIndex = buildCuratedProject(
  'demo-vortex',
  'Vortex Gateway',
  [
    ['vortex-root', null, 'Vortex Gateway', 'project', 0, 0],
    ['v-api', 'vortex-root', 'api', 'directory', 0, 0],
    ['v-auth', 'vortex-root', 'auth', 'directory', 0, 0],
    ['v-telemetry', 'vortex-root', 'telemetry', 'directory', 0, 0],
    ['v-config', 'vortex-root', 'config', 'directory', 0, 0],
    ['v-server', 'v-api', 'gateway.ts', 'file', 14200, 412, 'TypeScript'],
    ['v-routes', 'v-api', 'routeTable.ts', 'file', 9600, 290, 'TypeScript'],
    ['v-ratelimit', 'v-api', 'rateLimiter.ts', 'file', 7800, 215, 'TypeScript'],
    ['v-jwt', 'v-auth', 'tokenVerifier.ts', 'file', 11400, 326, 'TypeScript'],
    ['v-rbac', 'v-auth', 'policyGuard.ts', 'file', 8400, 240, 'TypeScript'],
    ['v-metrics', 'v-telemetry', 'traceCollector.ts', 'file', 6900, 198, 'TypeScript'],
    ['v-manifest', 'v-config', 'routes.yaml', 'file', 3100, 94, 'YAML'],
  ],
  [
    { id: 've1', sourceId: 'v-server', targetId: 'v-routes', specifier: './routeTable' },
    { id: 've2', sourceId: 'v-server', targetId: 'v-ratelimit', specifier: './rateLimiter' },
    { id: 've3', sourceId: 'v-server', targetId: 'v-metrics', specifier: '../telemetry/traceCollector' },
    { id: 've4', sourceId: 'v-routes', targetId: 'v-jwt', specifier: '../auth/tokenVerifier' },
    { id: 've5', sourceId: 'v-routes', targetId: 'v-rbac', specifier: '../auth/policyGuard' },
    { id: 've6', sourceId: 'v-rbac', targetId: 'v-jwt', specifier: './tokenVerifier' },
    { id: 've7', sourceId: 'v-jwt', targetPath: 'zod', specifier: 'zod', isExternal: true },
    { id: 've8', sourceId: 'v-server', targetPath: 'react', specifier: 'react', isExternal: true },
  ],
  [],
  ['zod', 'react'],
  2
);

export const CURATED_SAMPLE_PROJECTS: ProjectIndex[] = [demoProject, heliosProject, vortexProject];
