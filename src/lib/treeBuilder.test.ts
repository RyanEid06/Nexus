import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNexusTree, filterTree, FlatFileInput } from './treeBuilder';
import { FileFilterState } from '../types/nexus';

test('buildNexusTree: creates hierarchical structure, aggregates metrics, and computes language distribution', () => {
  const sampleFiles: FlatFileInput[] = [
    { path: 'src/main.ts', sizeBytes: 1000 },
    { path: 'src/components/Header.tsx', sizeBytes: 2000 },
    { path: 'src/components/Button.tsx', sizeBytes: 1500 },
    { path: 'package.json', sizeBytes: 500 },
    { path: 'README.md', sizeBytes: 800 },
  ];

  const { rootNode, allNodes, languageStats } = buildNexusTree('proj_demo_123', 'DemoProject', sampleFiles);

  assert.equal(rootNode.name, 'DemoProject');
  assert.equal(rootNode.kind, 'directory');
  assert.equal(rootNode.recursiveFileCount, 5);
  assert.equal(rootNode.recursiveBytes, 5800);
  assert.equal(rootNode.sizeBytes, 5800);

  // Check children of root: "src", "package.json", "README.md"
  assert.ok(rootNode.children);
  const rootChildrenNames = rootNode.children.map(c => c.name);
  assert.deepEqual(rootChildrenNames, ['src', 'package.json', 'README.md']);

  // Check src folder
  const srcNode = rootNode.children.find(c => c.name === 'src')!;
  assert.equal(srcNode.kind, 'directory');
  assert.equal(srcNode.recursiveFileCount, 3);
  assert.equal(srcNode.recursiveBytes, 4500);

  // Check language distribution
  assert.ok(languageStats.length >= 3);
  const tsxStat = languageStats.find(s => s.extension === 'tsx');
  assert.ok(tsxStat);
  assert.equal(tsxStat.count, 2);
  assert.equal(tsxStat.bytes, 3500);
});

test('filterTree: filters by search query and extension while pruning empty branches', () => {
  const sampleFiles: FlatFileInput[] = [
    { path: 'src/components/Header.tsx', sizeBytes: 2000 },
    { path: 'src/utils/math.ts', sizeBytes: 500 },
    { path: 'docs/guide.md', sizeBytes: 300 },
    { path: '.env', sizeBytes: 50 },
  ];

  const { rootNode } = buildNexusTree('proj_demo_123', 'DemoProject', sampleFiles);

  const defaultFilter: FileFilterState = {
    searchQuery: 'Header',
    selectedExtension: 'ALL',
    hideDotFiles: false,
    hideNodeModules: true,
    sortBy: 'name',
    sortOrder: 'asc',
  };

  const filtered = filterTree(rootNode, defaultFilter);
  assert.ok(filtered);
  assert.equal(filtered.children?.length, 1);
  assert.equal(filtered.children?.[0].name, 'src');

  // Extension filter test
  const extFilter: FileFilterState = {
    searchQuery: '',
    selectedExtension: 'md',
    hideDotFiles: false,
    hideNodeModules: true,
    sortBy: 'name',
    sortOrder: 'asc',
  };

  const filteredByExt = filterTree(rootNode, extFilter);
  assert.ok(filteredByExt);
  assert.equal(filteredByExt.children?.length, 1);
  assert.equal(filteredByExt.children?.[0].name, 'docs');
});
