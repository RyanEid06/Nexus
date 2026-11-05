import { describe, expect, it, vi } from 'vitest';
import {
  scanDirectoryHandle,
  type LocalDirectoryHandle,
  type LocalFileHandle,
  RootAccessError,
  ScanLimitError,
} from '../src/services/projectScanner';
import type { AnalysisCategory, ProjectIndex, ProjectNode } from '../src/domain/models';

function createMockFile(name: string, content: string, size = content.length, modified = 1000): LocalFileHandle {
  const textSpy = vi.fn().mockResolvedValue(content);
  return {
    kind: 'file',
    name,
    getFile: vi.fn().mockResolvedValue({
      name,
      size,
      lastModified: modified,
      text: textSpy,
    }),
  };
}

function createMockDirectory(name: string, entries: Array<LocalFileHandle | LocalDirectoryHandle>): LocalDirectoryHandle {
  return {
    kind: 'directory',
    name,
    values: async function* () {
      for (const entry of entries) {
        yield entry;
      }
    },
  };
}

describe('scanDirectoryHandle', () => {
  it('throws RootAccessError when root directory cannot be opened', async () => {
    const brokenRoot: LocalDirectoryHandle = {
      kind: 'directory',
      name: 'broken-root',
      values: () => {
        throw new Error('Access denied');
      },
    };

    await expect(scanDirectoryHandle(brokenRoot)).rejects.toThrow(RootAccessError);
  });

  it('marks sensitive files as skipped-sensitive and never calls file.text()', async () => {
    const sensitiveFile = createMockFile('.env', 'SECRET_KEY=12345');
    const normalFile = createMockFile('index.ts', 'console.log("hello");\n');

    const dir = createMockDirectory('test-app', [sensitiveFile, normalFile]);

    const result = await scanDirectoryHandle(dir);

    const sensitiveNode = result.nodes.find((n) => n.name === '.env');
    const normalNode = result.nodes.find((n) => n.name === 'index.ts');

    expect(sensitiveNode).toBeDefined();
    expect(sensitiveNode?.analysisStatus).toBe('skipped-sensitive');
    expect(sensitiveNode?.loc).toBe(0);

    const sensitiveFileObj = await sensitiveFile.getFile();
    expect(sensitiveFileObj.text).not.toHaveBeenCalled();

    expect(normalNode?.analysisStatus).toBe('analyzed');
    expect(normalNode?.loc).toBe(2);
  });

  it('marks binary and media files as metadata-only and never calls file.text()', async () => {
    const binaryFile = createMockFile('logo.png', '\x89PNG\r\n\x1a\n...', 1024);
    const wasmFile = createMockFile('module.wasm', '\0asm...', 2048);
    const dir = createMockDirectory('asset-app', [binaryFile, wasmFile]);

    const result = await scanDirectoryHandle(dir);
    const pngNode = result.nodes.find((n) => n.name === 'logo.png');
    const wasmNode = result.nodes.find((n) => n.name === 'module.wasm');

    expect(pngNode?.analysisStatus).toBe('metadata-only');
    expect(wasmNode?.analysisStatus).toBe('metadata-only');

    const pngObj = await binaryFile.getFile();
    const wasmObj = await wasmFile.getFile();
    expect(pngObj.text).not.toHaveBeenCalled();
    expect(wasmObj.text).not.toHaveBeenCalled();
  });

  it('never descends into ignored directories like node_modules or .git', async () => {
    const nodeModulesFile = createMockFile('heavy.js', 'console.log("vendor");');
    const nodeModulesDir = createMockDirectory('node_modules', [nodeModulesFile]);
    const srcFile = createMockFile('index.ts', 'export const ok = 1;');
    const rootDir = createMockDirectory('clean-app', [nodeModulesDir, srcFile]);

    const result = await scanDirectoryHandle(rootDir);
    expect(result.nodes.some((n) => n.name === 'node_modules')).toBe(false);
    expect(result.nodes.some((n) => n.name === 'heavy.js')).toBe(false);
    expect(result.nodes.some((n) => n.name === 'index.ts')).toBe(true);

    const vendorObj = await nodeModulesFile.getFile();
    expect(vendorObj.text).not.toHaveBeenCalled();
  });

  it('proves disabled Configuration category NEVER calls tsconfig.json.text()', async () => {
    const tsconfigFile = createMockFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['src/*'] } } })
    );
    const srcFile = createMockFile('index.ts', 'export const a = 1;');
    const dir = createMockDirectory('my-app', [tsconfigFile, srcFile]);

    // Disable configuration category
    const categoriesWithoutConfig = new Set<AnalysisCategory>(['source', 'documentation', 'test']);

    const result = await scanDirectoryHandle(dir, {
      analyzeCategories: categoriesWithoutConfig,
    });

    const tsconfigNode = result.nodes.find((n) => n.name === 'tsconfig.json');
    expect(tsconfigNode?.analysisStatus).toBe('metadata-only');

    const tsconfigObj = await tsconfigFile.getFile();
    expect(tsconfigObj.text).not.toHaveBeenCalled();
  });

  it('preserves disabled categories and configured maxTextFileBytes across Refresh', async () => {
    const configFile = createMockFile('tsconfig.json', '{"compilerOptions":{}}', 30);
    const sourceFile = createMockFile('app.ts', 'export const a = 1;\n', 20, 1000);
    const dir = createMockDirectory('app', [configFile, sourceFile]);

    // Initial import with configuration category disabled and maxTextFileBytes = 1 MB
    const initial = await scanDirectoryHandle(dir, {
      analyzeCategories: new Set<AnalysisCategory>(['source', 'documentation', 'test']),
      maxTextFileBytes: 1024 * 1024,
    });

    expect(initial.analysisConfig?.selectedCategories).not.toContain('configuration');
    expect(initial.analysisConfig?.maxTextFileBytes).toBe(1024 * 1024);

    const configObj = await configFile.getFile();
    expect(configObj.text).not.toHaveBeenCalled();

    // Now simulate ProjectsPage Refresh: call scanDirectoryHandle with ONLY previousProject
    const refreshConfigFile = createMockFile('tsconfig.json', '{"compilerOptions":{}}', 30);
    const refreshSourceFile = createMockFile('app.ts', 'export const a = 1;\n', 20, 1000);
    const refreshDir = createMockDirectory('app', [refreshConfigFile, refreshSourceFile]);

    const refreshed = await scanDirectoryHandle(refreshDir, {
      previousProject: initial,
    });

    // Configuration must STILL be disabled!
    expect(refreshed.analysisConfig?.selectedCategories).not.toContain('configuration');
    expect(refreshed.analysisConfig?.maxTextFileBytes).toBe(1024 * 1024);

    const refreshConfigObj = await refreshConfigFile.getFile();
    expect(refreshConfigObj.text).not.toHaveBeenCalled();

    // Source was unchanged so it also was not re-read
    const refreshSourceObj = await refreshSourceFile.getFile();
    expect(refreshSourceObj.text).not.toHaveBeenCalled();
  });

  it('invalidates skipped-large files when max read size is increased on refresh', async () => {
    // 3 MB file
    const largeFile = createMockFile('large.ts', 'export const big = 1;\n'.repeat(5000), 3 * 1024 * 1024, 1000);
    const dir = createMockDirectory('large-app', [largeFile]);

    // Initial scan with 2 MB limit
    const initial = await scanDirectoryHandle(dir, { maxTextFileBytes: 2 * 1024 * 1024 });
    const initialNode = initial.nodes.find((n) => n.name === 'large.ts');
    expect(initialNode?.analysisStatus).toBe('skipped-large');

    const fileObj1 = await largeFile.getFile();
    expect(fileObj1.text).not.toHaveBeenCalled();

    // Refresh with increased 5 MB limit
    const refreshFile = createMockFile('large.ts', 'export const big = 1;\n'.repeat(5000), 3 * 1024 * 1024, 1000);
    const refreshDir = createMockDirectory('large-app', [refreshFile]);

    const refreshed = await scanDirectoryHandle(refreshDir, {
      previousProject: initial,
      maxTextFileBytes: 5 * 1024 * 1024,
    });

    const refreshedNode = refreshed.nodes.find((n) => n.name === 'large.ts');
    expect(refreshedNode?.analysisStatus).toBe('analyzed');

    const refreshFileObj = await refreshFile.getFile();
    expect(refreshFileObj.text).toHaveBeenCalledTimes(1);
  });

  it('tests complete scanner + dependency integration with real mock folder and @/* alias resolution', async () => {
    const tsconfig = createMockFile(
      'tsconfig.json',
      `{
        // JSONC tsconfig with comments and trailing commas
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["src/*",],
          },
        },
      }`
    );

    const buttonFile = createMockFile(
      'Button.tsx',
      `export const Button = () => null;\n`
    );

    const appFile = createMockFile(
      'App.tsx',
      `import { Button } from '@/components/Button';
       export const App = () => Button();\n`
    );

    const componentsDir = createMockDirectory('components', [buttonFile]);
    const srcDir = createMockDirectory('src', [appFile, componentsDir]);
    const mockAppDir = createMockDirectory('my-app', [tsconfig, srcDir]);

    const result = await scanDirectoryHandle(mockAppDir);

    expect(result.nodes.length).toBeGreaterThanOrEqual(4);
    const appNode = result.nodes.find((n) => n.name === 'App.tsx');
    const buttonNode = result.nodes.find((n) => n.name === 'Button.tsx');

    expect(appNode?.path).toBe('src/App.tsx');
    expect(buttonNode?.path).toBe('src/components/Button.tsx');

    // Verify @/components/Button resolved internally to src/components/Button.tsx!
    const edge = result.dependencies?.edges.find((e) => e.specifier === '@/components/Button');
    expect(edge).toBeDefined();
    expect(edge?.isExternal).toBe(false);
    expect(edge?.isResolved).toBe(true);
    expect(edge?.targetPath).toBe('src/components/Button.tsx');
    expect(edge?.targetId).toBe(buttonNode?.id);
  });

  it('re-resolves dependencies when target is added without modifying unchanged importer', async () => {
    // Importer imports ./Button
    const appFile = createMockFile('App.tsx', `import { Button } from './Button';\n`, 35, 1000);
    const dirInitial = createMockDirectory('app', [appFile]);

    // Initial scan: Button.tsx does not exist -> unresolved
    const initial = await scanDirectoryHandle(dirInitial);
    const edgeInitial = initial.dependencies?.edges.find((e) => e.specifier === './Button');
    expect(edgeInitial?.isResolved).toBe(false);

    // Target Button.tsx is now created
    const appFileUnchanged = createMockFile('App.tsx', `import { Button } from './Button';\n`, 35, 1000);
    const buttonFileAdded = createMockFile('Button.tsx', `export const Button = 1;\n`, 25, 2000);
    const dirRefresh = createMockDirectory('app', [appFileUnchanged, buttonFileAdded]);

    const refreshed = await scanDirectoryHandle(dirRefresh, { previousProject: initial });

    // Importer App.tsx text was NOT re-read
    const appObj = await appFileUnchanged.getFile();
    expect(appObj.text).not.toHaveBeenCalled();

    // But edge is now successfully resolved!
    const edgeRefreshed = refreshed.dependencies?.edges.find((e) => e.specifier === './Button');
    expect(edgeRefreshed?.isResolved).toBe(true);
    expect(edgeRefreshed?.targetPath).toBe('Button.tsx');
  });

  it('invalidates dependency resolution when target is deleted without modifying unchanged importer', async () => {
    const appFile = createMockFile('App.tsx', `import { Button } from './Button';\n`, 35, 1000);
    const buttonFile = createMockFile('Button.tsx', `export const Button = 1;\n`, 25, 1000);
    const dirInitial = createMockDirectory('app', [appFile, buttonFile]);

    // Initial scan: resolved
    const initial = await scanDirectoryHandle(dirInitial);
    const edgeInitial = initial.dependencies?.edges.find((e) => e.specifier === './Button');
    expect(edgeInitial?.isResolved).toBe(true);

    // Button.tsx deleted on disk
    const appFileUnchanged = createMockFile('App.tsx', `import { Button } from './Button';\n`, 35, 1000);
    const dirRefresh = createMockDirectory('app', [appFileUnchanged]);

    const refreshed = await scanDirectoryHandle(dirRefresh, { previousProject: initial });

    // Importer App.tsx text was NOT re-read
    const appObj = await appFileUnchanged.getFile();
    expect(appObj.text).not.toHaveBeenCalled();

    // But edge is now unresolved because target was deleted!
    const edgeRefreshed = refreshed.dependencies?.edges.find((e) => e.specifier === './Button');
    expect(edgeRefreshed?.isResolved).toBe(false);
  });

  it('updates unchanged importer resolution when tsconfig alias mapping changes', async () => {
    const tsconfigV1 = createMockFile('tsconfig.json', `{"compilerOptions":{"paths":{"@/*":["src/v1/*"]}}}`);
    const appFile = createMockFile('App.tsx', `import { foo } from '@/foo';\n`, 30, 1000);
    const v1File = createMockFile('foo.ts', `export const foo = 1;\n`, 22, 1000);
    const srcDirV1 = createMockDirectory('src', [createMockDirectory('v1', [v1File])]);
    const dirV1 = createMockDirectory('app', [tsconfigV1, appFile, srcDirV1]);

    const initial = await scanDirectoryHandle(dirV1);
    const edgeInitial = initial.dependencies?.edges.find((e) => e.specifier === '@/foo');
    expect(edgeInitial?.targetPath).toBe('src/v1/foo.ts');

    // In v2: alias mapping changed to src/v2/*
    const tsconfigV2 = createMockFile('tsconfig.json', `{"compilerOptions":{"paths":{"@/*":["src/v2/*"]}}}`);
    const appFileUnchanged = createMockFile('App.tsx', `import { foo } from '@/foo';\n`, 30, 1000);
    const v2File = createMockFile('foo.ts', `export const foo = 2;\n`, 22, 2000);
    const srcDirV2 = createMockDirectory('src', [createMockDirectory('v2', [v2File])]);
    const dirV2 = createMockDirectory('app', [tsconfigV2, appFileUnchanged, srcDirV2]);

    const refreshed = await scanDirectoryHandle(dirV2, { previousProject: initial });

    // App.tsx source was NOT re-read
    const appObj = await appFileUnchanged.getFile();
    expect(appObj.text).not.toHaveBeenCalled();

    // Target re-resolved to new path!
    const edgeRefreshed = refreshed.dependencies?.edges.find((e) => e.specifier === '@/foo');
    expect(edgeRefreshed?.targetPath).toBe('src/v2/foo.ts');
  });

  it('correctly upgrades and reanalyzes old cached project lacking dependency parser data', async () => {
    const file = createMockFile('app.ts', `import React from 'react';\n`, 27, 1000);
    const dir = createMockDirectory('app', [file]);

    // Synthetic legacy project node without rawSpecifiers
    const legacyProject: ProjectIndex = {
      schemaVersion: 2 as any,
      id: 'legacy-id',
      name: 'app',
      rootPathLabel: 'app',
      createdAt: 100,
      updatedAt: 100,
      source: 'local',
      nodes: [
        {
          id: 'node:legacy-id:',
          projectId: 'legacy-id',
          parentId: null,
          name: 'app',
          path: '',
          kind: 'project',
          sizeBytes: 0,
          loc: 0,
          depth: 0,
        },
        {
          id: 'node:legacy-id:app.ts',
          projectId: 'legacy-id',
          parentId: 'node:legacy-id:',
          name: 'app.ts',
          path: 'app.ts',
          kind: 'file',
          sizeBytes: 27,
          loc: 1,
          modifiedAt: 1000,
          depth: 1,
          analysisStatus: 'analyzed',
          // Lacks rawSpecifiers!
        },
      ],
      metrics: {
        files: 1,
        folders: 0,
        totalLoc: 1,
        indexedBytes: 27,
        analyzedTextBytes: 27,
        analyzedFiles: 1,
        metadataOnlyFiles: 0,
        skippedLargeFiles: 0,
        skippedSensitiveFiles: 0,
        languages: [{ language: 'TypeScript', files: 1, loc: 1, percentage: 100 }],
        dependencyEdges: 0,
      },
      warnings: [],
    };

    const refreshed = await scanDirectoryHandle(dir, { previousProject: legacyProject });
    const refreshedNode = refreshed.nodes.find((n) => n.name === 'app.ts');

    expect(refreshedNode?.rawSpecifiers).toBeDefined();
    expect(refreshedNode?.rawSpecifiers?.length).toBe(1);
    expect(refreshed.dependencies?.edges.length).toBe(1);
  });
});
