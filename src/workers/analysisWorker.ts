/**
 * NEXUS Analysis Web Worker
 * Offloads CPU-intensive dependency parsing, graph resolution, and Tarjan SCC
 * from the UI thread to keep frame rendering smooth.
 */

import { computeGraphData, parseSourceBatch, type BatchItem } from '../services/analysisEngine';
import type { RawSpecifier } from '../domain/models';
import type { TsConfigAliases } from '../utils/jsonc';

export type WorkerRequest =
  | { type: 'PARSE_BATCH'; requestId: string; items: BatchItem[] }
  | {
      type: 'RESOLVE_GRAPH';
      requestId: string;
      files: Array<{ id: string; path: string; rawSpecifiers: RawSpecifier[] }>;
      allFilePaths: string[];
      aliases?: TsConfigAliases;
    };

export type WorkerResponse =
  | { type: 'PARSE_BATCH_SUCCESS'; requestId: string; results: ReturnType<typeof parseSourceBatch> }
  | { type: 'RESOLVE_GRAPH_SUCCESS'; requestId: string; graph: ReturnType<typeof computeGraphData> }
  | { type: 'ERROR'; requestId: string; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'PARSE_BATCH') {
      const results = parseSourceBatch(req.items);
      self.postMessage({
        type: 'PARSE_BATCH_SUCCESS',
        requestId: req.requestId,
        results,
      } satisfies WorkerResponse);
    } else if (req.type === 'RESOLVE_GRAPH') {
      const graph = computeGraphData(req.files, req.allFilePaths, req.aliases);
      self.postMessage({
        type: 'RESOLVE_GRAPH_SUCCESS',
        requestId: req.requestId,
        graph,
      } satisfies WorkerResponse);
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : 'Unknown worker error',
    } satisfies WorkerResponse);
  }
};
