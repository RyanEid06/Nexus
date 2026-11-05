import type { DependencyEdge, DependencyGraphData, ProjectIndex, ProjectNode } from '../domain/models';
import { aggregateDirectoryStats, calculateMetrics } from '../services/metrics';

const p = 'demo-atlas';
const raw: Array<[string, string | null, string, ProjectNode['kind'], number, number, string?]> = [
  ['root', null, 'Atlas', 'project', 0, 0],
  ['src', 'root', 'src', 'directory', 0, 0], ['public', 'root', 'public', 'directory', 0, 0], ['database', 'root', 'database', 'directory', 0, 0],
  ['tests', 'root', 'tests', 'directory', 0, 0], ['docs', 'root', 'docs', 'directory', 0, 0], ['config', 'root', 'config', 'directory', 0, 0],
  ['app', 'src', 'app', 'directory', 0, 0], ['components', 'src', 'components', 'directory', 0, 0], ['services', 'src', 'services', 'directory', 0, 0],
  ['App.tsx', 'app', 'App.tsx', 'file', 8300, 242, 'TypeScript'], ['Router.tsx', 'app', 'Router.tsx', 'file', 6200, 187, 'TypeScript'],
  ['Dashboard.tsx', 'components', 'Dashboard.tsx', 'file', 19800, 642, 'TypeScript'], ['Sidebar.tsx', 'components', 'Sidebar.tsx', 'file', 9800, 311, 'TypeScript'],
  ['GraphView.tsx', 'components', 'GraphView.tsx', 'file', 22800, 701, 'TypeScript'], ['AuthService.ts', 'services', 'AuthService.ts', 'file', 12100, 421, 'TypeScript'],
  ['api.ts', 'services', 'api.ts', 'file', 8700, 387, 'TypeScript'], ['schema.sql', 'database', 'schema.sql', 'file', 7300, 214, 'SQL'],
  ['graph.test.ts', 'tests', 'graph.test.ts', 'file', 9100, 291, 'TypeScript'], ['README.md', 'docs', 'README.md', 'file', 6400, 180, 'Markdown'],
  ['architecture.md', 'docs', 'architecture.md', 'file', 5300, 146, 'Markdown'], ['vite.config.ts', 'config', 'vite.config.ts', 'file', 2100, 68, 'TypeScript'],
];

const position: Record<string, [number, number, number]> = {
  root:[0,0,0], src:[0,0,5], public:[-6,0,1], database:[6,0,2], tests:[5,0,-4], docs:[-5,0,-4], config:[0,0,-6],
  app:[-2.5,-.5,8], components:[2.2,-.5,8], services:[0,-.5,10.5], 'App.tsx':[-3.5,-1,10], 'Router.tsx':[-1.5,-1,10],
  'Dashboard.tsx':[1,-1,10.5], 'Sidebar.tsx':[2.5,-1,11], 'GraphView.tsx':[4,-1,10.5], 'AuthService.ts':[-1,-1,13], 'api.ts':[1,-1,13],
  'schema.sql':[8,-1,3], 'graph.test.ts':[7,-1,-6], 'README.md':[-7,-1,-5], 'architecture.md':[-4,-1,-7], 'vite.config.ts':[0,-1,-9],
};

const pathOf = (id: string): string => {
  const item = raw.find((entry) => entry[0] === id);
  if (!item) return id;
  if (!item[1]) return '';
  const parent = pathOf(item[1]);
  return parent ? `${parent}/${item[2]}` : item[2];
};

const depthOf = (id: string): number => {
  const pth = pathOf(id);
  return pth ? pth.split('/').length : 0;
};
const baseTime = Date.UTC(2026, 10, 1, 12, 0, 0);

const rawNodes: ProjectNode[] = raw.map(([id, parentId, name, kind, sizeBytes, loc, language], index) => ({
  id, projectId: p, parentId, name, path: pathOf(id), kind, sizeBytes, loc, language,
  extension: kind === 'file' ? name.split('.').pop() : undefined, depth: depthOf(id), position: position[id] ?? [0,0,0],
  modifiedAt: kind === 'file' ? baseTime - index * 3_600_000 : undefined, analysisStatus: kind === 'file' ? 'analyzed' : undefined,
}));

const demoEdges: DependencyEdge[] = [
  { id: 'e1', sourceId: 'App.tsx', sourcePath: 'src/app/App.tsx', targetId: 'Router.tsx', targetPath: 'src/app/Router.tsx', specifier: './Router', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e2', sourceId: 'App.tsx', sourcePath: 'src/app/App.tsx', targetId: 'Sidebar.tsx', targetPath: 'src/components/Sidebar.tsx', specifier: '../components/Sidebar', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e3', sourceId: 'Router.tsx', sourcePath: 'src/app/Router.tsx', targetId: 'Dashboard.tsx', targetPath: 'src/components/Dashboard.tsx', specifier: '../components/Dashboard', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e4', sourceId: 'Router.tsx', sourcePath: 'src/app/Router.tsx', targetId: 'GraphView.tsx', targetPath: 'src/components/GraphView.tsx', specifier: '../components/GraphView', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e5', sourceId: 'Dashboard.tsx', sourcePath: 'src/components/Dashboard.tsx', targetId: 'api.ts', targetPath: 'src/services/api.ts', specifier: '../services/api', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e6', sourceId: 'Dashboard.tsx', sourcePath: 'src/components/Dashboard.tsx', targetPath: 'react', specifier: 'react', type: 'static-import', isExternal: true, isResolved: true },
  { id: 'e7', sourceId: 'GraphView.tsx', sourcePath: 'src/components/GraphView.tsx', targetId: 'api.ts', targetPath: 'src/services/api.ts', specifier: '../services/api', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e8', sourceId: 'GraphView.tsx', sourcePath: 'src/components/GraphView.tsx', targetPath: 'three', specifier: 'three', type: 'static-import', isExternal: true, isResolved: true },
  { id: 'e9', sourceId: 'api.ts', sourcePath: 'src/services/api.ts', targetId: 'AuthService.ts', targetPath: 'src/services/AuthService.ts', specifier: './AuthService', type: 'static-import', isExternal: false, isResolved: true },
  { id: 'e10', sourceId: 'graph.test.ts', sourcePath: 'tests/graph.test.ts', targetId: 'GraphView.tsx', targetPath: 'src/components/GraphView.tsx', specifier: '../src/components/GraphView', type: 'static-import', isExternal: false, isResolved: true },
];

const demoDependencies: DependencyGraphData = {
  edges: demoEdges,
  circularDependencies: [],
  externalPackages: ['react', 'three'],
};

const outgoingCounts = new Map<string, number>();
const incomingCounts = new Map<string, number>();
for (const edge of demoEdges) {
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

const nodes = aggregateDirectoryStats(rawNodes);
const metrics = calculateMetrics(nodes);
metrics.dependencyEdges = demoEdges.filter((e) => !e.isExternal && e.isResolved).length;
metrics.externalPackagesCount = demoDependencies.externalPackages.length;
metrics.circularDependenciesCount = 0;

export const demoProject: ProjectIndex = {
  schemaVersion: 3,
  id: p,
  name: 'Atlas Demo',
  rootPathLabel: 'Atlas Demo',
  createdAt: baseTime - 5 * 86_400_000,
  updatedAt: baseTime,
  source: 'demo',
  nodes,
  metrics,
  warnings: [],
  dependencies: demoDependencies,
  analysisConfig: {
    selectedCategories: ['source', 'configuration', 'documentation', 'test'],
    maxTextFileBytes: 2 * 1024 * 1024,
    maxEntries: 50_000,
    scannerAnalysisVersion: 1,
    dependencyParserVersion: 2,
    dependencyResolverVersion: 2,
  },
};
