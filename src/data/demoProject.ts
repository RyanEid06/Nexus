import type { ProjectIndex, ProjectNode } from '../domain/models';
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
  if (!item[1]) return item[2];
  return `${pathOf(item[1])}/${item[2]}`;
};

const depthOf = (id: string): number => pathOf(id).split('/').length - 1;
const baseTime = Date.UTC(2026, 10, 1, 12, 0, 0);

const rawNodes: ProjectNode[] = raw.map(([id, parentId, name, kind, sizeBytes, loc, language], index) => ({
  id, projectId: p, parentId, name, path: pathOf(id), kind, sizeBytes, loc, language,
  extension: kind === 'file' ? name.split('.').pop() : undefined, depth: depthOf(id), position: position[id] ?? [0,0,0],
  modifiedAt: kind === 'file' ? baseTime - index * 3_600_000 : undefined, analysisStatus: kind === 'file' ? 'analyzed' : undefined,
}));

const nodes = aggregateDirectoryStats(rawNodes);
const metrics = calculateMetrics(nodes);
metrics.dependencyEdges = 0;

export const demoProject: ProjectIndex = {
  schemaVersion: 2,
  id: p,
  name: 'Atlas Demo',
  rootPathLabel: 'Atlas Demo',
  createdAt: baseTime - 5 * 86_400_000,
  updatedAt: baseTime,
  source: 'demo',
  nodes,
  metrics,
  warnings: [],
};
