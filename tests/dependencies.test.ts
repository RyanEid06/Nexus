import { describe, expect, it } from 'vitest';
import {
  extractSpecifiers,
  resolveSpecifier,
  parseTsConfigAliases,
  findCircularDependencies,
  findShortestDependencyPath,
  buildDependencyGraph,
} from '../src/services/dependencies';
import type { DependencyEdge } from '../domain/models';

describe('dependencies service', () => {
  describe('robust lexical parsing', () => {
    it('handles single-line and multiline static imports', () => {
      const code = `
        import {
          foo,
          bar,
        } from './multiline/module';
        import single from './single/module';
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: './multiline/module', type: 'static-import' },
        { specifier: './single/module', type: 'static-import' },
      ]);
    });

    it('handles default + named imports, import type, and side-effects', () => {
      const code = `
        import React, { useState, useEffect } from 'react';
        import type { UserModel } from './models/user';
        import type RootState from './store';
        import './styles/global.css';
        import "normalize.css";
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: 'react', type: 'static-import' },
        { specifier: './models/user', type: 'static-import' },
        { specifier: './store', type: 'static-import' },
        { specifier: './styles/global.css', type: 'side-effect' },
        { specifier: 'normalize.css', type: 'side-effect' },
      ]);
    });

    it('handles multiline export { ... } from and export * from', () => {
      const code = `
        export {
          Button,
          Icon,
        } from './components/Buttons';
        export * from './domain/models';
        export * as helpers from './utils/helpers';
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: './components/Buttons', type: 'export-from' },
        { specifier: './domain/models', type: 'export-from' },
        { specifier: './utils/helpers', type: 'export-from' },
      ]);
    });

    it('handles dynamic import and require', () => {
      const code = `
        async function load() {
          const mod = await import('./heavy/chart');
          const legacy = require('legacy-math');
          // Should not invent an edge for dynamic variables!
          const dynamicMod = await import(computedPath);
          const dynamicReq = require(dynamicName);
        }
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: './heavy/chart', type: 'dynamic-import' },
        { specifier: 'legacy-math', type: 'require' },
      ]);
    });

    it('ignores comments and normal strings containing fake imports', () => {
      const code = `
        // import { fake1 } from 'fake-1';
        /*
          import { fake2 } from 'fake-2';
          export * from 'fake-3';
        */
        const s1 = "import { fake4 } from 'fake-4'";
        const s2 = 'export { fake5 } from "./fake-5"';
        const s3 = "const req = require('fake-6')";
        const s4 = "escaped \\" quote with import { fake7 } from 'fake-7'";
        import real from './real/target';
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: './real/target', type: 'static-import' },
      ]);
    });

    it('ignores raw template literals but extracts dynamic imports inside embedded expressions', () => {
      const code = `
        const templateStr = \`
          import { fake } from 'fake-template';
          export * from 'fake-export';
        \`;
        const active = \`Loaded: \${await import('./embedded/target')}\`;
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: './embedded/target', type: 'dynamic-import' },
      ]);
    });

    it('handles semicolonless source and imports split across lines', () => {
      const code = `
        import a
          from
          './module-a'
        import b from './module-b'

        const important = true
        const myImport = 42
        obj.require('not-a-require')
        obj.import('not-an-import')
        class Importer {}
      `;
      const specifiers = extractSpecifiers(code);
      expect(specifiers).toEqual([
        { specifier: './module-a', type: 'static-import' },
        { specifier: './module-b', type: 'static-import' },
      ]);
    });
  });

  describe('canonical project-relative path resolution', () => {
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
  });

  describe('Tarjan Strongly Connected Components (SCC) circular dependency detection', () => {
    it('detects simple 3-node cycle: A -> B -> C -> A', () => {
      const edges: DependencyEdge[] = [
        { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
        { id: '2', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
        { id: '3', sourceId: 'c', sourcePath: 'src/c.ts', targetPath: 'src/a.ts', specifier: './a', type: 'static-import', isExternal: false, isResolved: true },
        { id: '4', sourceId: 'd', sourcePath: 'src/d.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
      ];

      const sccs = findCircularDependencies(edges);
      expect(sccs.length).toBe(1);
      expect(sccs[0]).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });

    it('detects overlapping cycles as a single strongly connected component', () => {
      // Cycle 1: a -> b -> a
      // Cycle 2: b -> c -> b
      // Mutually reachable {a, b, c} form one SCC
      const edges: DependencyEdge[] = [
        { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
        { id: '2', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/a.ts', specifier: './a', type: 'static-import', isExternal: false, isResolved: true },
        { id: '3', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
        { id: '4', sourceId: 'c', sourcePath: 'src/c.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
      ];

      const sccs = findCircularDependencies(edges);
      expect(sccs.length).toBe(1);
      expect(sccs[0]).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });

    it('detects two completely independent cycles', () => {
      // Cycle 1: a -> b -> a
      // Cycle 2: x -> y -> x
      const edges: DependencyEdge[] = [
        { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
        { id: '2', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/a.ts', specifier: './a', type: 'static-import', isExternal: false, isResolved: true },
        { id: '3', sourceId: 'x', sourcePath: 'src/x.ts', targetPath: 'src/y.ts', specifier: './y', type: 'static-import', isExternal: false, isResolved: true },
        { id: '4', sourceId: 'y', sourcePath: 'src/y.ts', targetPath: 'src/x.ts', specifier: './x', type: 'static-import', isExternal: false, isResolved: true },
      ];

      const sccs = findCircularDependencies(edges);
      expect(sccs.length).toBe(2);
      expect(sccs).toContainEqual(['src/a.ts', 'src/b.ts']);
      expect(sccs).toContainEqual(['src/x.ts', 'src/y.ts']);
    });

    it('returns empty array for a clean DAG (no cycles)', () => {
      const edges: DependencyEdge[] = [
        { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
        { id: '2', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
        { id: '3', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
      ];

      const sccs = findCircularDependencies(edges);
      expect(sccs).toEqual([]);
    });

    it('identifies module self-loop: A -> A', () => {
      const edges: DependencyEdge[] = [
        { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/a.ts', specifier: './a', type: 'static-import', isExternal: false, isResolved: true },
      ];

      const sccs = findCircularDependencies(edges);
      expect(sccs.length).toBe(1);
      expect(sccs[0]).toEqual(['src/a.ts']);
    });

    it('handles SCC with multiple internal cross-edges correctly', () => {
      const edges: DependencyEdge[] = [
        { id: '1', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/b.ts', specifier: './b', type: 'static-import', isExternal: false, isResolved: true },
        { id: '2', sourceId: 'a', sourcePath: 'src/a.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
        { id: '3', sourceId: 'b', sourcePath: 'src/b.ts', targetPath: 'src/c.ts', specifier: './c', type: 'static-import', isExternal: false, isResolved: true },
        { id: '4', sourceId: 'c', sourcePath: 'src/c.ts', targetPath: 'src/a.ts', specifier: './a', type: 'static-import', isExternal: false, isResolved: true },
      ];

      const sccs = findCircularDependencies(edges);
      expect(sccs.length).toBe(1);
      expect(sccs[0]).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });
  });

  describe('shortest path finder (BFS)', () => {
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
  });

  describe('graph building and node resolution', () => {
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
});
