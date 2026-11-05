import { describe, expect, it } from 'vitest';
import {
  extractSpecifiers,
  resolveSpecifier,
  parseTsConfigAliases,
  findCircularDependencies,
  findShortestDependencyPath,
  buildDependencyGraph,
} from '../src/services/dependencies';
import type { DependencyEdge } from '../src/domain/models';

describe('dependencies service', () => {
  it('extracts static, side-effect, export-from, dynamic import, and require specifiers', () => {
    const code = `
      // Single line comment with fake import from 'fake'
      /* Multi-line comment
         import { bad } from 'bad';
      */
      import React, { useState } from 'react';
      import './styles/app.css';
      export { Sidebar } from './components/Sidebar';
      export * from './domain/models';

      async function load() {
        const mod = await import('./heavy/module');
        const legacy = require('legacy-pkg');
      }
    `;

    const specifiers = extractSpecifiers(code);
    expect(specifiers).toEqual([
      { specifier: 'react', type: 'static-import' },
      { specifier: './styles/app.css', type: 'side-effect' },
      { specifier: './components/Sidebar', type: 'export-from' },
      { specifier: './domain/models', type: 'export-from' },
      { specifier: './heavy/module', type: 'dynamic-import' },
      { specifier: 'legacy-pkg', type: 'require' },
    ]);
  });

  it('resolves relative file paths with extension variants and index files', () => {
    const allFiles = new Set([
      'src/App.tsx',
      'src/components/Sidebar.tsx',
      'src/components/Brand.tsx',
      'src/utils/fileTypes.ts',
      'src/data/index.ts',
      'src/styles/app.css',
    ]);

    // Extensionless relative import
    const r1 = resolveSpecifier('src/App.tsx', './components/Sidebar', allFiles);
    expect(r1).toEqual({ targetPath: 'src/components/Sidebar.tsx', isExternal: false, isResolved: true });

    // Relative import with .js extension targeting .tsx
    const r2 = resolveSpecifier('src/components/Sidebar.tsx', './Brand.js', allFiles);
    expect(r2).toEqual({ targetPath: 'src/components/Brand.tsx', isExternal: false, isResolved: true });

    // Directory index resolution
    const r3 = resolveSpecifier('src/App.tsx', './data', allFiles);
    expect(r3).toEqual({ targetPath: 'src/data/index.ts', isExternal: false, isResolved: true });

    // Unresolved relative import
    const r4 = resolveSpecifier('src/App.tsx', './nonexistent/file', allFiles);
    expect(r4).toEqual({ targetPath: 'src/nonexistent/file', isExternal: false, isResolved: false });

    // External npm package
    const r5 = resolveSpecifier('src/App.tsx', 'lucide-react', allFiles);
    expect(r5).toEqual({ targetPath: 'lucide-react', isExternal: true, isResolved: true });

    // Scoped external npm package
    const r6 = resolveSpecifier('src/App.tsx', '@react-three/fiber/dist', allFiles);
    expect(r6).toEqual({ targetPath: '@react-three/fiber', isExternal: true, isResolved: true });
  });

  it('resolves tsconfig aliases correctly', () => {
    const tsconfig = `
      {
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["src/*"],
            "@components/*": ["src/components/*"]
          }
        }
      }
    `;
    const aliases = parseTsConfigAliases(tsconfig);
    const allFiles = new Set([
      'src/components/Sidebar.tsx',
      'src/utils/math.ts',
    ]);

    const r1 = resolveSpecifier('src/App.tsx', '@/components/Sidebar', allFiles, aliases);
    expect(r1).toEqual({ targetPath: 'src/components/Sidebar.tsx', isExternal: false, isResolved: true });

    const r2 = resolveSpecifier('src/App.tsx', '@components/Sidebar', allFiles, aliases);
    expect(r2).toEqual({ targetPath: 'src/components/Sidebar.tsx', isExternal: false, isResolved: true });
  });

  it('detects circular dependencies accurately', () => {
    const edges: DependencyEdge[] = [
      { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
      { id: '2', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
      { id: '3', sourceId: 'c', sourcePath: 'src/c.ts', targetPath: 'src/a.ts', specifier: './a', type: 'static-import', isExternal: false, isResolved: true },
      { id: '4', sourceId: 'd', sourcePath: 'src/d.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
    ];

    const cycles = findCircularDependencies(edges);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts']);
  });

  it('finds the shortest path between modules via BFS', () => {
    const edges: DependencyEdge[] = [
      { id: '1', sourceId: 'app', sourcePath: 'src/App.tsx', targetPath: 'src/routes.tsx', specifier: './routes', type: 'static-import', isExternal: false, isResolved: true },
      { id: '2', sourceId: 'routes', sourcePath: 'src/routes.tsx', targetPath: 'src/Dashboard.tsx', specifier: './Dashboard', type: 'static-import', isExternal: false, isResolved: true },
      { id: '3', sourceId: 'app', sourcePath: 'src/App.tsx', targetPath: 'src/Dashboard.tsx', specifier: './Dashboard', type: 'static-import', isExternal: false, isResolved: true },
    ];

    const pathDirect = findShortestDependencyPath('src/App.tsx', 'src/Dashboard.tsx', edges);
    expect(pathDirect).toEqual(['src/App.tsx', 'src/Dashboard.tsx']);

    const pathNone = findShortestDependencyPath('src/Dashboard.tsx', 'src/App.tsx', edges);
    expect(pathNone).toBeNull();
  });

  it('builds complete graph data and links target node IDs', () => {
    const files = [
      { id: 'id_main', path: 'src/main.ts', text: "import { run } from './app';" },
      { id: 'id_app', path: 'src/app.ts', text: "import React from 'react'; export const run = () => {};" },
    ];
    const allPaths = new Set(['src/main.ts', 'src/app.ts']);

    const graph = buildDependencyGraph(files, allPaths);
    expect(graph.edges.length).toBe(2);

    const internalEdge = graph.edges.find((e) => !e.isExternal)!;
    expect(internalEdge.sourceId).toBe('id_main');
    expect(internalEdge.targetId).toBe('id_app');
    expect(internalEdge.targetPath).toBe('src/app.ts');

    const externalEdge = graph.edges.find((e) => e.isExternal)!;
    expect(externalEdge.targetPath).toBe('react');
    expect(graph.externalPackages).toContain('react');
  });
});
