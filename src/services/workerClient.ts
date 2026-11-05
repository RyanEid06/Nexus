/**
 * NEXUS Worker Client
 * Coordinates message passing between main thread and analysis Web Worker.
 * Automatically falls back to pure synchronous execution in test/non-worker environments.
 */

import { computeGraphData, parseSourceBatch, type BatchItem, type ParsedBatchResult } from './analysisEngine';
import type { DependencyGraphData, RawSpecifier } from '../domain/models';
import type { TsConfigAliases } from '../utils/jsonc';
import type { WorkerRequest, WorkerResponse } from '../workers/analysisWorker';

export interface PendingHandler<T> {
  resolve: (val: T) => void;
  reject: (err: Error) => void;
  cleanup: () => void;
}

export class AnalysisWorkerBridge {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingHandler<any>>();
  private nextId = 1;

  constructor() {
    this.initWorker();
  }

  public initWorker(): void {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../workers/analysisWorker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const res = e.data;
          const handler = this.pending.get(res.requestId);
          if (!handler) return;
          this.pending.delete(res.requestId);
          handler.cleanup();

          if (res.type === 'PARSE_BATCH_SUCCESS') {
            handler.resolve(res.results);
          } else if (res.type === 'RESOLVE_GRAPH_SUCCESS') {
            handler.resolve(res.graph);
          } else if (res.type === 'ERROR') {
            handler.reject(new Error(res.message));
          }
        };
        this.worker.onerror = (err) => {
          this.handleWorkerCrash(err);
        };
      } catch {
        this.worker = null;
      }
    }
  }

  /**
   * Internal handler when the Web Worker encounters an unrecoverable error or crash.
   * Immediately rejects all pending requests, cleans up abort listeners, clears the pending map,
   * terminates the dead worker, and resets worker state.
   */
  public handleWorkerCrash(err?: unknown): void {
    const errorMsg =
      err instanceof Error
        ? `Analysis Web Worker failed: ${err.message}`
        : 'Analysis Web Worker encountered a fatal error';

    // Terminate worker if still alive
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore termination errors
      }
      this.worker = null;
    }

    // Reject all pending promises and run cleanup
    const pendingList = Array.from(this.pending.values());
    this.pending.clear();
    for (const handler of pendingList) {
      try {
        handler.cleanup();
      } catch {
        // Ignore cleanup errors
      }
      handler.reject(new Error(errorMsg));
    }
  }

  public terminate(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore
      }
      this.worker = null;
    }
    const pendingList = Array.from(this.pending.values());
    this.pending.clear();
    for (const handler of pendingList) {
      try {
        handler.cleanup();
      } catch {
        // Ignore
      }
      handler.reject(new DOMException('Worker terminated', 'AbortError'));
    }
  }

  public getPendingCount(): number {
    return this.pending.size;
  }

  public isWorkerActive(): boolean {
    return this.worker !== null;
  }

  public async parseBatch(items: BatchItem[], signal?: AbortSignal): Promise<ParsedBatchResult[]> {
    if (signal?.aborted) throw new DOMException('Operation was aborted', 'AbortError');
    if (!items.length) return [];

    if (!this.worker) {
      this.initWorker();
    }

    if (!this.worker) {
      // In-process fallback (e.g. Node test environment or unsupported browser)
      return parseSourceBatch(items);
    }

    const requestId = `req_${this.nextId++}`;
    return new Promise<ParsedBatchResult[]>((resolve, reject) => {
      let abortHandler: (() => void) | null = null;
      const cleanup = () => {
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      abortHandler = () => {
        this.pending.delete(requestId);
        cleanup();
        reject(new DOMException('Operation was aborted', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pending.set(requestId, {
        resolve,
        reject,
        cleanup,
      });

      const message: WorkerRequest = {
        type: 'PARSE_BATCH',
        requestId,
        items,
      };

      try {
        const activeWorker = this.worker;
        if (!activeWorker) throw new Error('Worker unavailable');
        activeWorker.postMessage(message);
      } catch {
        // postMessage threw synchronously (e.g. serialization failure or dead worker)
        this.pending.delete(requestId);
        cleanup();
        if (signal?.aborted) {
          reject(new DOMException('Operation was aborted', 'AbortError'));
          return;
        }
        // Fall back to synchronous pure parser
        try {
          const syncResult = parseSourceBatch(items);
          resolve(syncResult);
        } catch (syncErr) {
          reject(syncErr instanceof Error ? syncErr : new Error(String(syncErr)));
        }
      }
    });
  }

  public async resolveGraph(
    files: Array<{ id: string; path: string; rawSpecifiers: RawSpecifier[] }>,
    allFilePaths: string[],
    aliases?: TsConfigAliases,
    signal?: AbortSignal
  ): Promise<DependencyGraphData> {
    if (signal?.aborted) throw new DOMException('Operation was aborted', 'AbortError');

    if (!this.worker) {
      this.initWorker();
    }

    if (!this.worker) {
      return computeGraphData(files, allFilePaths, aliases);
    }

    const requestId = `req_${this.nextId++}`;
    return new Promise<DependencyGraphData>((resolve, reject) => {
      let abortHandler: (() => void) | null = null;
      const cleanup = () => {
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      abortHandler = () => {
        this.pending.delete(requestId);
        cleanup();
        reject(new DOMException('Operation was aborted', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pending.set(requestId, {
        resolve,
        reject,
        cleanup,
      });

      const message: WorkerRequest = {
        type: 'RESOLVE_GRAPH',
        requestId,
        files,
        allFilePaths,
        aliases,
      };

      try {
        const activeWorker = this.worker;
        if (!activeWorker) throw new Error('Worker unavailable');
        activeWorker.postMessage(message);
      } catch {
        // postMessage threw synchronously
        this.pending.delete(requestId);
        cleanup();
        if (signal?.aborted) {
          reject(new DOMException('Operation was aborted', 'AbortError'));
          return;
        }
        try {
          const syncResult = computeGraphData(files, allFilePaths, aliases);
          resolve(syncResult);
        } catch (syncErr) {
          reject(syncErr instanceof Error ? syncErr : new Error(String(syncErr)));
        }
      }
    });
  }
}

export const workerBridge = new AnalysisWorkerBridge();
