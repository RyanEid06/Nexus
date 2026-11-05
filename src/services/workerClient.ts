/**
 * NEXUS Worker Client
 * Coordinates message passing between main thread and analysis Web Worker.
 * Automatically falls back to pure synchronous execution in test/non-worker environments.
 */

import { computeGraphData, parseSourceBatch, type BatchItem, type ParsedBatchResult } from './analysisEngine';
import type { DependencyGraphData, RawSpecifier } from '../domain/models';
import type { TsConfigAliases } from '../utils/jsonc';
import type { WorkerRequest, WorkerResponse } from '../workers/analysisWorker';

class AnalysisWorkerBridge {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (val: any) => void; reject: (err: Error) => void }>();
  private nextId = 1;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
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

          if (res.type === 'PARSE_BATCH_SUCCESS') {
            handler.resolve(res.results);
          } else if (res.type === 'RESOLVE_GRAPH_SUCCESS') {
            handler.resolve(res.graph);
          } else if (res.type === 'ERROR') {
            handler.reject(new Error(res.message));
          }
        };
        this.worker.onerror = (err) => {
          console.warn('Analysis worker error, will fall back if needed:', err);
        };
      } catch {
        this.worker = null;
      }
    }
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      for (const [, handler] of this.pending) {
        handler.reject(new DOMException('Worker terminated', 'AbortError'));
      }
      this.pending.clear();
    }
  }

  public async parseBatch(items: BatchItem[], signal?: AbortSignal): Promise<ParsedBatchResult[]> {
    if (signal?.aborted) throw new DOMException('Operation was aborted', 'AbortError');
    if (!items.length) return [];

    if (!this.worker) {
      // In-process fallback (e.g. Node test environment)
      return parseSourceBatch(items);
    }

    const requestId = `req_${this.nextId++}`;
    return new Promise<ParsedBatchResult[]>((resolve, reject) => {
      const abortHandler = () => {
        this.pending.delete(requestId);
        reject(new DOMException('Operation was aborted', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pending.set(requestId, {
        resolve: (val) => {
          if (signal) signal.removeEventListener('abort', abortHandler);
          resolve(val);
        },
        reject: (err) => {
          if (signal) signal.removeEventListener('abort', abortHandler);
          reject(err);
        },
      });

      const message: WorkerRequest = {
        type: 'PARSE_BATCH',
        requestId,
        items,
      };
      this.worker?.postMessage(message);
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
      return computeGraphData(files, allFilePaths, aliases);
    }

    const requestId = `req_${this.nextId++}`;
    return new Promise<DependencyGraphData>((resolve, reject) => {
      const abortHandler = () => {
        this.pending.delete(requestId);
        reject(new DOMException('Operation was aborted', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pending.set(requestId, {
        resolve: (val) => {
          if (signal) signal.removeEventListener('abort', abortHandler);
          resolve(val);
        },
        reject: (err) => {
          if (signal) signal.removeEventListener('abort', abortHandler);
          reject(err);
        },
      });

      const message: WorkerRequest = {
        type: 'RESOLVE_GRAPH',
        requestId,
        files,
        allFilePaths,
        aliases,
      };
      this.worker?.postMessage(message);
    });
  }
}

export const workerBridge = new AnalysisWorkerBridge();
