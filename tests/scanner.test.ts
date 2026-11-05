import { describe, expect, it, vi } from 'vitest';
import {
  scanDirectoryHandle,
  type LocalDirectoryHandle,
  type LocalFileHandle,
  RootAccessError,
  ScanLimitError,
} from '../src/services/projectScanner';
import type { ProjectIndex, ProjectNode } from '../src/domain/models';

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

  it('marks files exceeding maxTextFileBytes as skipped-large and skips reading', async () => {
    const hugeFile = createMockFile('huge.ts', 'const a = 1;', 5 * 1024 * 1024);
    const dir = createMockDirectory('test-app', [hugeFile]);

    const result = await scanDirectoryHandle(dir, { maxTextFileBytes: 1024 * 1024 });
    const node = result.nodes.find((n) => n.name === 'huge.ts');

    expect(node?.analysisStatus).toBe('skipped-large');
    const fileObj = await hugeFile.getFile();
    expect(fileObj.text).not.toHaveBeenCalled();
  });

  it('throws ScanLimitError and does not persist project when entry limit is exceeded', async () => {
    const files = Array.from({ length: 15 }, (_, i) => createMockFile(`file${i}.ts`, 'export const x = 1;'));
    const dir = createMockDirectory('test-app', files);

    await expect(scanDirectoryHandle(dir, { maxEntries: 10 })).rejects.toThrow(ScanLimitError);
  });

  it('re-uses unchanged files during incremental refresh without calling file.text()', async () => {
    const file1 = createMockFile('a.ts', 'export const a = 1;\nexport const b = 2;\n', 40, 1000);
    const file2 = createMockFile('b.ts', 'export const c = 3;\n', 20, 1000);
    const dir = createMockDirectory('my-app', [file1, file2]);

    // Initial scan
    const initialProject = await scanDirectoryHandle(dir);
    expect(initialProject.metrics.analyzedFiles).toBe(2);

    const file1Obj = await file1.getFile();
    expect(file1Obj.text).toHaveBeenCalledTimes(1);

    // Prepare incremental refresh where file1 is unchanged (same modifiedAt & size),
    // and file2 has been modified
    const file1Unchanged = createMockFile('a.ts', 'cached content', 40, 1000);
    const file2Modified = createMockFile('b.ts', 'export const c = 3;\nexport const d = 4;\n', 42, 2000);
    const refreshDir = createMockDirectory('my-app', [file1Unchanged, file2Modified]);

    const refreshedProject = await scanDirectoryHandle(refreshDir, {
      previousProject: initialProject,
    });

    // File1 should be reused without calling text()
    const file1RefreshObj = await file1Unchanged.getFile();
    expect(file1RefreshObj.text).not.toHaveBeenCalled();

    // File2 was modified so text() was called
    const file2RefreshObj = await file2Modified.getFile();
    expect(file2RefreshObj.text).toHaveBeenCalledTimes(1);

    const aNode = refreshedProject.nodes.find((n) => n.name === 'a.ts');
    const bNode = refreshedProject.nodes.find((n) => n.name === 'b.ts');

    expect(aNode?.loc).toBe(3); // Preserved from initial
    expect(bNode?.loc).toBe(3); // Newly analyzed
  });

  it('respects AbortSignal during scan', async () => {
    const controller = new AbortController();
    controller.abort();

    const file = createMockFile('a.ts', 'export const a = 1;');
    const dir = createMockDirectory('my-app', [file]);

    await expect(scanDirectoryHandle(dir, { signal: controller.signal })).rejects.toThrow();
  });
});
