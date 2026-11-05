import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import type { ProjectIndex, ProjectNode } from '../src/domain/models';
import { readProjectFile, FilePreviewError } from '../src/services/filePreview';

const mockDemoProject: ProjectIndex = {
  schemaVersion: 3,
  id: 'demo-atlas',
  name: 'Atlas Demo',
  rootPathLabel: 'Atlas Demo',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  source: 'demo',
  nodes: [
    { id: 'root', projectId: 'demo-atlas', parentId: null, name: 'Atlas Demo', path: '', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
    { id: 'docs', projectId: 'demo-atlas', parentId: 'root', name: 'docs', path: 'docs', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
    { id: 'readme', projectId: 'demo-atlas', parentId: 'docs', name: 'README.md', path: 'docs/README.md', kind: 'file', sizeBytes: 500, loc: 20, depth: 2, language: 'Markdown' },
    { id: 'app', projectId: 'demo-atlas', parentId: 'root', name: 'App.tsx', path: 'src/app/App.tsx', kind: 'file', sizeBytes: 300, loc: 15, depth: 2, language: 'TypeScript' },
  ],
  metrics: {
    files: 2,
    folders: 1,
    totalLoc: 35,
    indexedBytes: 800,
    analyzedTextBytes: 800,
    analyzedFiles: 2,
    metadataOnlyFiles: 0,
    skippedLargeFiles: 0,
    skippedSensitiveFiles: 0,
    languages: [],
    dependencyEdges: 0,
  },
  warnings: [],
  analysisConfig: {
    selectedCategories: ['source', 'documentation'],
    maxTextFileBytes: 1024 * 1024,
    maxEntries: 1000,
    scannerAnalysisVersion: 1,
    dependencyParserVersion: 2,
    dependencyResolverVersion: 2,
  },
};

describe('File Preview Service', () => {
  it('reads demo files safely with metadata', async () => {
    const readmeNode = mockDemoProject.nodes.find((n) => n.id === 'readme')!;
    const result = await readProjectFile(mockDemoProject, readmeNode);

    expect(result.name).toBe('README.md');
    expect(result.path).toBe('docs/README.md');
    expect(result.content).toContain('Atlas');
    expect(result.language).toBe('Markdown');
  });

  it('rejects previewing a non-file node (directory or project)', async () => {
    const dirNode = mockDemoProject.nodes.find((n) => n.id === 'docs')!;
    await expect(readProjectFile(mockDemoProject, dirNode)).rejects.toThrowError(FilePreviewError);
  });

  it('rejects sensitive files (.env, .npmrc, .key) without reading', async () => {
    const sensitiveNode: ProjectNode = {
      id: 'env',
      projectId: 'p',
      parentId: 'root',
      name: '.env',
      path: '.env',
      kind: 'file',
      sizeBytes: 100,
      loc: 5,
      depth: 1,
    };
    await expect(readProjectFile(mockDemoProject, sensitiveNode)).rejects.toThrow(
      /matches sensitive file safety rules/
    );
  });

  it('rejects paths containing directory traversal (..)', async () => {
    const traversalNode: ProjectNode = {
      id: 'evil',
      projectId: 'p',
      parentId: 'root',
      name: 'evil.ts',
      path: '../evil.ts',
      kind: 'file',
      sizeBytes: 100,
      loc: 5,
      depth: 1,
    };
    await expect(readProjectFile(mockDemoProject, traversalNode)).rejects.toThrow(
      /directory traversal/
    );
  });

  it('rejects unsupported binary files', async () => {
    const binaryNode: ProjectNode = {
      id: 'binary',
      projectId: 'p',
      parentId: 'root',
      name: 'image.png',
      path: 'assets/image.png',
      kind: 'file',
      sizeBytes: 1000,
      loc: 0,
      depth: 1,
    };
    await expect(readProjectFile(mockDemoProject, binaryNode)).rejects.toThrow(
      /unsupported binary file/
    );
  });

  it('rejects files exceeding maxTextFileBytes', async () => {
    const oversizedNode: ProjectNode = {
      id: 'huge',
      projectId: 'p',
      parentId: 'root',
      name: 'bundle.js',
      path: 'dist/bundle.js',
      kind: 'file',
      sizeBytes: 5 * 1024 * 1024, // 5 MB > 1 MB config
      loc: 10000,
      depth: 1,
      language: 'JavaScript',
    };
    await expect(readProjectFile(mockDemoProject, oversizedNode)).rejects.toThrow(
      /exceeds safe preview threshold/
    );
  });

  it('handles local project with missing handle gracefully', async () => {
    const localProject: ProjectIndex = {
      ...mockDemoProject,
      id: 'local-proj-no-handle',
      source: 'local',
    };
    const localFile: ProjectNode = {
      id: 'f1',
      projectId: localProject.id,
      parentId: 'root',
      name: 'main.ts',
      path: 'src/main.ts',
      kind: 'file',
      sizeBytes: 200,
      loc: 10,
      depth: 1,
      language: 'TypeScript',
    };

    await expect(readProjectFile(localProject, localFile)).rejects.toThrow(
      /handle is not connected/
    );
  });

  it('rejects uncurated demo files rather than fabricating fake source (GEMINI.md Section 16)', async () => {
    const uncuratedDemoNode: ProjectNode = {
      id: 'unreal-demo-file',
      projectId: 'demo-atlas',
      parentId: 'root',
      name: 'Uncurated.ts',
      path: 'src/Uncurated.ts',
      kind: 'file',
      sizeBytes: 150,
      loc: 10,
      depth: 1,
      language: 'TypeScript',
    };

    await expect(readProjectFile(mockDemoProject, uncuratedDemoNode)).rejects.toThrow(
      /Demo source content is not available/
    );
  });
});

