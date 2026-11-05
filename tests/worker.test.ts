import { describe, expect, it, vi } from 'vitest';
import { parseSourceBatch, computeGraphData } from '../src/services/analysisEngine';
import { workerBridge } from '../src/services/workerClient';

describe('worker and analysis engine', () => {
  it('parses source file batches extracting loc and rawSpecifiers deterministically', () => {
    const batch = [
      { id: '1', path: 'src/a.ts', text: 'import b from "./b";\nexport const x = 1;\n' },
      { id: '2', path: 'src/b.ts', text: 'export const y = 2;\n' },
    ];

    const results = parseSourceBatch(batch);
    expect(results.length).toBe(2);

    expect(results[0].loc).toBe(3);
    expect(results[0].rawSpecifiers).toEqual([{ specifier: './b', type: 'static-import' }]);

    expect(results[1].loc).toBe(2);
    expect(results[1].rawSpecifiers).toEqual([]);
  });

  it('computes complete graph data with Tarjan SCC off-thread engine', () => {
    const files = [
      { id: '1', path: 'src/a.ts', rawSpecifiers: [{ specifier: './b', type: 'static-import' as const }] },
      { id: '2', path: 'src/b.ts', rawSpecifiers: [{ specifier: './a', type: 'static-import' as const }] },
    ];
    const allPaths = ['src/a.ts', 'src/b.ts'];

    const graph = computeGraphData(files, allPaths);
    expect(graph.edges.length).toBe(2);
    expect(graph.edges.every((e) => e.isResolved)).toBe(true);
    expect(graph.circularDependencies).toEqual([['src/a.ts', 'src/b.ts']]);
  });

  it('workerBridge executes batch parsing and resolution', async () => {
    const batch = [
      { id: 'app', path: 'src/App.tsx', text: 'import React from "react";\nimport { Button } from "./Button";\n' },
      { id: 'btn', path: 'src/Button.tsx', text: 'export const Button = 1;\n' },
    ];

    const parsed = await workerBridge.parseBatch(batch);
    expect(parsed.length).toBe(2);
    expect(parsed[0].rawSpecifiers.length).toBe(2);

    const graph = await workerBridge.resolveGraph(
      parsed.map((p) => ({ id: p.id, path: p.path, rawSpecifiers: p.rawSpecifiers })),
      ['src/App.tsx', 'src/Button.tsx']
    );

    expect(graph.edges.length).toBe(2);
    const internal = graph.edges.find((e) => !e.isExternal);
    expect(internal?.targetPath).toBe('src/Button.tsx');
    expect(internal?.isResolved).toBe(true);
  });

  it('workerBridge respects AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      workerBridge.parseBatch([{ id: '1', path: 'a.ts', text: 'const x = 1;' }], controller.signal)
    ).rejects.toThrow();

    await expect(
      workerBridge.resolveGraph([], [], undefined, controller.signal)
    ).rejects.toThrow();
  });

  it('rejects all pending work and clears pending map when worker encounters fatal error', async () => {
    const { AnalysisWorkerBridge } = await import('../src/services/workerClient');
    const bridge = new AnalysisWorkerBridge();

    // Mock an active worker
    const mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null as any,
      onerror: null as any,
    };
    (bridge as any).worker = mockWorker;

    // Start a parse batch request that would await worker response
    const parsePromise = bridge.parseBatch([{ id: '1', path: 'file.ts', text: 'const a = 1;' }]);
    expect(bridge.getPendingCount()).toBe(1);

    // Simulate worker crashing
    bridge.handleWorkerCrash(new Error('Out of memory'));

    await expect(parsePromise).rejects.toThrow('Analysis Web Worker failed: Out of memory');
    expect(bridge.getPendingCount()).toBe(0);
    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(bridge.isWorkerActive()).toBe(false);
  });

  it('subsequent calls after worker crash execute cleanly via synchronous fallback without hanging', async () => {
    const { AnalysisWorkerBridge } = await import('../src/services/workerClient');
    const bridge = new AnalysisWorkerBridge();

    // Simulate crash
    bridge.handleWorkerCrash(new Error('Fatal worker crash'));
    expect(bridge.isWorkerActive()).toBe(false);

    // New work should succeed via synchronous engine fallback without hanging
    const result = await bridge.parseBatch([{ id: '1', path: 'src/main.ts', text: 'import x from "./x";' }]);
    expect(result.length).toBe(1);
    expect(result[0].rawSpecifiers).toEqual([{ specifier: './x', type: 'static-import' }]);
    expect(bridge.getPendingCount()).toBe(0);
  });

  it('handles postMessage throwing synchronously without hanging and falls back to pure engine', async () => {
    const { AnalysisWorkerBridge } = await import('../src/services/workerClient');
    const bridge = new AnalysisWorkerBridge();

    const mockWorker = {
      postMessage: vi.fn().mockImplementation(() => {
        throw new Error('DataCloneError: message cannot be cloned');
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    (bridge as any).worker = mockWorker;

    // postMessage fails immediately, but the promise resolves via synchronous fallback without hanging!
    const result = await bridge.parseBatch([{ id: '1', path: 'src/data.ts', text: 'export const num = 42;' }]);
    expect(result.length).toBe(1);
    expect(result[0].loc).toBe(1);
    expect(bridge.getPendingCount()).toBe(0);
  });

  it('aborted signal cancels pending request and removes listener', async () => {
    const { AnalysisWorkerBridge } = await import('../src/services/workerClient');
    const bridge = new AnalysisWorkerBridge();

    const mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    (bridge as any).worker = mockWorker;

    const controller = new AbortController();
    const promise = bridge.parseBatch([{ id: '1', path: 'src/heavy.ts', text: 'const z = 100;' }], controller.signal);

    expect(bridge.getPendingCount()).toBe(1);
    controller.abort();

    await expect(promise).rejects.toThrow('Operation was aborted');
    expect(bridge.getPendingCount()).toBe(0);
  });
});
