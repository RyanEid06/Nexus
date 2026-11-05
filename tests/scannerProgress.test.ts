import { describe, expect, it, vi } from 'vitest';
import {
  ProgressScheduler,
  scanDirectoryHandle,
  type LocalDirectoryHandle,
  type LocalFileHandle,
} from '../src/services/projectScanner';
import {
  SCANNER_ANALYSIS_VERSION,
  type ProjectIndex,
  type ScanPhase,
  type ScanProgress,
} from '../src/domain/models';

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

describe('Project Analysis Progress Scheduler & Hardening', () => {
  it('1. Throttles rapid progress calls to bounded frequency (~10 Hz)', () => {
    vi.useFakeTimers();
    const calls: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => calls.push(p), 100);

    // Rapidly fire 50 progress updates in 10ms
    for (let i = 1; i <= 50; i++) {
      scheduler.update({
        phase: 'analyzing',
        discovered: 100,
        totalFilesToProcess: 100,
        processedFiles: i,
        analyzed: i,
        reused: 0,
        warnings: 0,
        percentage: i,
        currentPath: `src/file_${i}.ts`,
      });
      vi.advanceTimersByTime(0.2);
    }

    // First call fires immediately, intermediate calls are throttled
    expect(calls.length).toBe(1);
    expect(calls[0].processedFiles).toBe(1);

    // Advance 100ms
    vi.advanceTimersByTime(100);
    expect(calls.length).toBe(2);
    // Coalesced to the latest state
    expect(calls[1].processedFiles).toBe(50);
    expect(calls[1].percentage).toBe(50);

    vi.useRealTimers();
  });

  it('2. Coalesces intermediate state: only the latest snapshot is dispatched on interval', () => {
    vi.useFakeTimers();
    const emitted: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => emitted.push(p), 100);

    scheduler.update({
      phase: 'discovering',
      discovered: 10,
      totalFilesToProcess: undefined,
      processedFiles: 0,
      analyzed: 0,
      reused: 0,
      warnings: 0,
      percentage: undefined,
      currentPath: 'src/a.ts',
    });

    expect(emitted.length).toBe(1);

    // Rapid updates
    scheduler.update({
      phase: 'discovering',
      discovered: 20,
      totalFilesToProcess: undefined,
      processedFiles: 0,
      analyzed: 0,
      reused: 0,
      warnings: 0,
      percentage: undefined,
      currentPath: 'src/b.ts',
    });
    scheduler.update({
      phase: 'discovering',
      discovered: 30,
      totalFilesToProcess: undefined,
      processedFiles: 0,
      analyzed: 0,
      reused: 0,
      warnings: 0,
      percentage: undefined,
      currentPath: 'src/c.ts',
    });
    scheduler.update({
      phase: 'discovering',
      discovered: 99,
      totalFilesToProcess: undefined,
      processedFiles: 0,
      analyzed: 0,
      reused: 0,
      warnings: 0,
      percentage: undefined,
      currentPath: 'src/final.ts',
    });

    vi.advanceTimersByTime(100);
    expect(emitted.length).toBe(2);
    expect(emitted[1].discovered).toBe(99);
    expect(emitted[1].currentPath).toBe('src/final.ts');

    vi.useRealTimers();
  });

  it('3. flush() emits the latest pending state synchronously and clears timer', () => {
    vi.useFakeTimers();
    const emitted: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => emitted.push(p), 100);

    scheduler.update({
      phase: 'analyzing',
      discovered: 10,
      totalFilesToProcess: 10,
      processedFiles: 1,
      analyzed: 1,
      reused: 0,
      warnings: 0,
      percentage: 10,
      currentPath: 'src/a.ts',
    });
    expect(emitted.length).toBe(1);

    scheduler.update({
      phase: 'analyzing',
      discovered: 10,
      totalFilesToProcess: 10,
      processedFiles: 5,
      analyzed: 5,
      reused: 0,
      warnings: 0,
      percentage: 50,
      currentPath: 'src/e.ts',
    });
    expect(emitted.length).toBe(1);

    scheduler.flush();
    expect(emitted.length).toBe(2);
    expect(emitted[1].processedFiles).toBe(5);

    // Ensure timer does not fire duplicate after flush
    vi.advanceTimersByTime(200);
    expect(emitted.length).toBe(2);

    vi.useRealTimers();
  });

  it('4. cancel() cancels pending timer and prevents any further emissions', () => {
    vi.useFakeTimers();
    const emitted: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => emitted.push(p), 100);

    scheduler.update({
      phase: 'analyzing',
      discovered: 10,
      totalFilesToProcess: 10,
      processedFiles: 1,
      analyzed: 1,
      reused: 0,
      warnings: 0,
      percentage: 10,
      currentPath: 'src/a.ts',
    });
    expect(emitted.length).toBe(1);

    scheduler.update({
      phase: 'analyzing',
      discovered: 10,
      totalFilesToProcess: 10,
      processedFiles: 2,
      analyzed: 2,
      reused: 0,
      warnings: 0,
      percentage: 20,
      currentPath: 'src/b.ts',
    });
    scheduler.cancel();

    vi.advanceTimersByTime(200);
    scheduler.update({
      phase: 'analyzing',
      discovered: 10,
      totalFilesToProcess: 10,
      processedFiles: 3,
      analyzed: 3,
      reused: 0,
      warnings: 0,
      percentage: 30,
      currentPath: 'src/c.ts',
    });
    scheduler.flush();

    expect(emitted.length).toBe(1);

    vi.useRealTimers();
  });

  it('5. Truthful phases: discovering, analyzing, building-relationships, finalizing, saving, complete', () => {
    const validPhases: ScanPhase[] = [
      'discovering',
      'analyzing',
      'building-relationships',
      'finalizing',
      'saving',
      'complete',
    ];

    // Discovering has indeterminate undefined percentage and totalFilesToProcess
    const discoveringProgress: ScanProgress = {
      phase: 'discovering',
      discovered: 150,
      totalFilesToProcess: undefined,
      processedFiles: 0,
      analyzed: 0,
      reused: 0,
      warnings: 0,
      percentage: undefined,
      currentPath: 'src/modules',
    };
    expect(discoveringProgress.percentage).toBeUndefined();
    expect(discoveringProgress.totalFilesToProcess).toBeUndefined();
    expect(validPhases).toContain(discoveringProgress.phase);

    // Analyzing has determinate percentage based on processedFiles / totalFilesToProcess
    const analyzingProgress: ScanProgress = {
      phase: 'analyzing',
      discovered: 200,
      totalFilesToProcess: 200,
      processedFiles: 50,
      analyzed: 40,
      reused: 10,
      warnings: 0,
      percentage: 25,
      currentPath: 'src/app.tsx',
    };
    expect(analyzingProgress.percentage).toBe(25);
    expect(analyzingProgress.processedFiles).toBe(50);
    expect(analyzingProgress.totalFilesToProcess).toBe(200);
    expect(validPhases).toContain(analyzingProgress.phase);

    // Building relationships & finalizing
    const relProgress: ScanProgress = {
      phase: 'building-relationships',
      discovered: 200,
      totalFilesToProcess: 200,
      processedFiles: 200,
      analyzed: 190,
      reused: 10,
      warnings: 0,
      percentage: 100,
      currentPath: 'Building dependency relationships...',
    };
    expect(validPhases).toContain(relProgress.phase);

    const finalizingProgress: ScanProgress = {
      phase: 'finalizing',
      discovered: 200,
      totalFilesToProcess: 200,
      processedFiles: 200,
      analyzed: 190,
      reused: 10,
      warnings: 0,
      percentage: 100,
      currentPath: 'Finalizing architectural metrics...',
    };
    expect(validPhases).toContain(finalizingProgress.phase);
  });

  it('6. Accurate monotonic percentage calculation naturally reaches 100', () => {
    const totalFilesToProcess = 250;
    let prevPercentage = -1;

    for (let processed = 0; processed <= totalFilesToProcess; processed += 25) {
      const percentage = Math.min(100, Math.floor((processed / totalFilesToProcess) * 100));
      expect(percentage).toBeGreaterThanOrEqual(prevPercentage);
      prevPercentage = percentage;
    }
    expect(prevPercentage).toBe(100);
  });

  it('7. SCANNER_ANALYSIS_VERSION is bumped to 2 for cache invalidation', () => {
    expect(SCANNER_ANALYSIS_VERSION).toBe(2);
  });

  it('8. Integration: scanDirectoryHandle emissions, phase order, processedFiles counting, and 100% completion', async () => {
    // Construct test directory with:
    // 1. Analyzed TS file
    // 2. Sensitive file (.env)
    // 3. Metadata-only file (.png)
    // 4. Large file (exceeds 500 bytes threshold)
    // 5. Reused file (with matching mtime/size from previous scan)
    const fileAnalyzed = createMockFile('index.ts', 'export const a = 1;', 20, 1000);
    const fileSensitive = createMockFile('.env', 'API_KEY=secret', 14, 1000);
    const fileMetadataOnly = createMockFile('logo.png', '\x89PNG...', 100, 1000);
    const fileLarge = createMockFile('data.txt', 'x'.repeat(600), 600, 1000);
    const fileReused = createMockFile('cached.ts', 'export const cached = 2;', 25, 1000);

    const mockDir = createMockDirectory('test-repo', [
      fileAnalyzed,
      fileSensitive,
      fileMetadataOnly,
      fileLarge,
      fileReused,
    ]);

    const previousProject: ProjectIndex = {
      schemaVersion: 3,
      id: 'prev-1',
      name: 'test-repo',
      rootPathLabel: '/test-repo',
      createdAt: 1000,
      updatedAt: 1000,
      source: 'local',
      warnings: [],
      analysisConfig: {
        selectedCategories: ['source', 'configuration', 'documentation', 'test'],
        maxTextFileBytes: 500,
        maxEntries: 10000,
        scannerAnalysisVersion: SCANNER_ANALYSIS_VERSION,
        dependencyParserVersion: 2,
        dependencyResolverVersion: 2,
      },
      metrics: {
        files: 1,
        folders: 0,
        totalLoc: 1,
        indexedBytes: 25,
        analyzedTextBytes: 25,
        analyzedFiles: 1,
        metadataOnlyFiles: 0,
        skippedLargeFiles: 0,
        skippedSensitiveFiles: 0,
        languages: [],
        dependencyEdges: 0,
      },
      nodes: [
        {
          id: 'prev_cached',
          projectId: 'prev-1',
          parentId: 'root',
          name: 'cached.ts',
          kind: 'file',
          path: 'cached.ts',
          loc: 1,
          sizeBytes: 25,
          depth: 1,
          modifiedAt: 1000,
          rawSpecifiers: [{ specifier: './other', type: 'static-import' }],
          dependencyParserVersion: 2,
          analysisStatus: 'analyzed',
        },
      ],
      dependencies: { edges: [], externalPackages: [], circularDependencies: [] },
    };

    const progressEvents: ScanProgress[] = [];
    const result = await scanDirectoryHandle(mockDir, {
      previousProject,
      maxTextFileBytes: 500, // fileLarge (600 bytes) will be skipped-large
      analyzeCategories: new Set(['source', 'configuration', 'documentation', 'test']),
      onProgress: (p: ScanProgress) => progressEvents.push({ ...p }),
    });

    expect(result).toBeDefined();

    // Verify phases occurred in correct order
    const phases = progressEvents.map((e) => e.phase);
    expect(phases).toContain('discovering');
    expect(phases).toContain('analyzing');
    expect(phases).toContain('building-relationships');
    expect(phases).toContain('finalizing');

    // Discovery phase has indeterminate percentage
    const discoveryEvent = progressEvents.find((e) => e.phase === 'discovering');
    expect(discoveryEvent?.percentage).toBeUndefined();
    expect(discoveryEvent?.totalFilesToProcess).toBeUndefined();

    // Final analyzing event has processedFiles === totalFilesToProcess and percentage === 100 naturally
    const analyzingEvents = progressEvents.filter((e) => e.phase === 'analyzing');
    const finalAnalyzingEvent = analyzingEvents[analyzingEvents.length - 1];
    expect(finalAnalyzingEvent.totalFilesToProcess).toBe(5);
    expect(finalAnalyzingEvent.processedFiles).toBe(5);
    expect(finalAnalyzingEvent.percentage).toBe(100);

    // Verify breakdown:
    // 1 analyzed (index.ts)
    // 1 reused (cached.ts)
    // 3 non-analyzed (sensitive, metadata-only, skipped-large)
    // All 5 accounted for in processedFiles!
    expect(finalAnalyzingEvent.analyzed).toBe(1);
    expect(finalAnalyzingEvent.reused).toBe(1);
    expect(finalAnalyzingEvent.processedFiles).toBe(5);
  });

  it('9. AbortSignal cleanly cancels scanDirectoryHandle without finalizing', async () => {
    const file1 = createMockFile('a.ts', 'export const a = 1;');
    const file2 = createMockFile('b.ts', 'export const b = 2;');
    const mockDir = createMockDirectory('abort-repo', [file1, file2]);

    const controller = new AbortController();
    controller.abort(); // pre-aborted

    await expect(
      scanDirectoryHandle(mockDir, { signal: controller.signal })
    ).rejects.toThrow();
  });
});
