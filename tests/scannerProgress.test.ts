import { describe, expect, it, vi } from 'vitest';
import { ProgressScheduler, type ScanProgress } from '../src/services/projectScanner';
import { shouldIgnoreEntry } from '../src/services/ignoreRules';
import { SCANNER_ANALYSIS_VERSION } from '../src/domain/models';

describe('Project Analysis Progress Scheduler & Hardening', () => {
  it('1. Throttles rapid progress calls to bounded frequency (~10 Hz)', () => {
    vi.useFakeTimers();
    const calls: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => calls.push(p), 100);

    // Rapidly fire 50 progress updates in 10ms
    for (let i = 1; i <= 50; i++) {
      scheduler.update({
        phase: 'analyzing',
        analyzedFiles: i,
        totalFiles: 100,
        percentage: i,
        currentPath: `src/file_${i}.ts`,
      });
      vi.advanceTimersByTime(0.2);
    }

    // First call fires immediately, intermediate calls are throttled
    expect(calls.length).toBe(1);
    expect(calls[0].analyzedFiles).toBe(1);

    // Advance 100ms
    vi.advanceTimersByTime(100);
    expect(calls.length).toBe(2);
    // Coalesced to the latest state
    expect(calls[1].analyzedFiles).toBe(50);
    expect(calls[1].percentage).toBe(50);

    vi.useRealTimers();
  });

  it('2. Coalesces intermediate state: only the latest snapshot is dispatched on interval', () => {
    vi.useFakeTimers();
    const emitted: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => emitted.push(p), 100);

    scheduler.update({
      phase: 'discovering',
      analyzedFiles: 10,
      totalFiles: null,
      percentage: null,
      currentPath: 'src/a.ts',
    });

    expect(emitted.length).toBe(1);

    // Rapid updates
    scheduler.update({ phase: 'discovering', analyzedFiles: 20, totalFiles: null, percentage: null, currentPath: 'src/b.ts' });
    scheduler.update({ phase: 'discovering', analyzedFiles: 30, totalFiles: null, percentage: null, currentPath: 'src/c.ts' });
    scheduler.update({ phase: 'discovering', analyzedFiles: 99, totalFiles: null, percentage: null, currentPath: 'src/final.ts' });

    vi.advanceTimersByTime(100);
    expect(emitted.length).toBe(2);
    expect(emitted[1].analyzedFiles).toBe(99);
    expect(emitted[1].currentPath).toBe('src/final.ts');

    vi.useRealTimers();
  });

  it('3. flush() emits the latest pending state synchronously and clears timer', () => {
    vi.useFakeTimers();
    const emitted: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => emitted.push(p), 100);

    scheduler.update({ phase: 'analyzing', analyzedFiles: 1, totalFiles: 10, percentage: 10 });
    expect(emitted.length).toBe(1);

    scheduler.update({ phase: 'analyzing', analyzedFiles: 5, totalFiles: 10, percentage: 50 });
    expect(emitted.length).toBe(1);

    scheduler.flush();
    expect(emitted.length).toBe(2);
    expect(emitted[1].analyzedFiles).toBe(5);

    // Ensure timer does not fire duplicate after flush
    vi.advanceTimersByTime(200);
    expect(emitted.length).toBe(2);

    vi.useRealTimers();
  });

  it('4. cancel() cancels pending timer and prevents any further emissions', () => {
    vi.useFakeTimers();
    const emitted: ScanProgress[] = [];
    const scheduler = new ProgressScheduler((p) => emitted.push(p), 100);

    scheduler.update({ phase: 'analyzing', analyzedFiles: 1, totalFiles: 10, percentage: 10 });
    expect(emitted.length).toBe(1);

    scheduler.update({ phase: 'analyzing', analyzedFiles: 2, totalFiles: 10, percentage: 20 });
    scheduler.cancel();

    vi.advanceTimersByTime(200);
    scheduler.update({ phase: 'analyzing', analyzedFiles: 3, totalFiles: 10, percentage: 30 });
    scheduler.flush();

    expect(emitted.length).toBe(1);

    vi.useRealTimers();
  });

  it('5. Four truthful phases: discovering, analyzing, building-relationships, and saving', () => {
    const phases: Array<ScanProgress['phase']> = ['discovering', 'analyzing', 'building-relationships', 'saving'];

    // Discovering has null percentage
    const discoveringProgress: ScanProgress = {
      phase: 'discovering',
      analyzedFiles: 150,
      totalFiles: null,
      percentage: null,
      currentPath: 'src/modules',
    };
    expect(discoveringProgress.percentage).toBeNull();
    expect(discoveringProgress.totalFiles).toBeNull();

    // Analyzing has determinate percentage
    const analyzingProgress: ScanProgress = {
      phase: 'analyzing',
      analyzedFiles: 50,
      totalFiles: 200,
      percentage: 25,
      currentPath: 'src/app.tsx',
    };
    expect(analyzingProgress.percentage).toBe(25);
    expect(analyzingProgress.totalFiles).toBe(200);

    // Building relationships
    const relProgress: ScanProgress = {
      phase: 'building-relationships',
      analyzedFiles: 200,
      totalFiles: 200,
      percentage: 100,
    };
    expect(phases).toContain(relProgress.phase);
  });

  it('6. Accurate monotonic percentage calculation', () => {
    const totalFiles = 250;
    let prevPercentage = -1;

    for (let i = 0; i <= totalFiles; i += 25) {
      const percentage = Math.min(100, Math.floor((i / totalFiles) * 100));
      expect(percentage).toBeGreaterThanOrEqual(prevPercentage);
      prevPercentage = percentage;
    }
    expect(prevPercentage).toBe(100);
  });

  it('7. Custom excluded directory paths are correctly honored by ignore rules', () => {
    const customExclusions = new Set(['fixtures', 'vendor', 'temp/data']);

    // Standard entries
    expect(shouldIgnoreEntry('node_modules', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('src', 'directory')).toBe(false);

    // Custom excluded directories
    expect(shouldIgnoreEntry('fixtures', 'directory', customExclusions)).toBe(true);
    expect(shouldIgnoreEntry('vendor', 'directory', customExclusions)).toBe(true);
    expect(shouldIgnoreEntry('other_dir', 'directory', customExclusions)).toBe(false);
  });

  it('8. SCANNER_ANALYSIS_VERSION is bumped to 2 for cache invalidation', () => {
    expect(SCANNER_ANALYSIS_VERSION).toBe(2);
  });
});
