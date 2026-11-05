/**
 * NEXUS Pure Analysis Engine
 * Decoupled, deterministic computation of lines-of-code, raw dependency specifiers,
 * and graph resolution with Tarjan's SCC.
 */

import type { DependencyGraphData, RawSpecifier } from '../domain/models';
import { buildDependencyGraph, extractSpecifiers, type TsConfigAliases } from './dependencies';

export interface BatchItem {
  id: string;
  path: string;
  text: string;
}

export interface ParsedBatchResult {
  id: string;
  path: string;
  loc: number;
  rawSpecifiers: RawSpecifier[];
}

export function parseSourceBatch(items: BatchItem[]): ParsedBatchResult[] {
  return items.map((item) => {
    const loc = item.text.length === 0 ? 0 : item.text.split(/\r?\n/).length;
    const rawSpecifiers = extractSpecifiers(item.text);
    return {
      id: item.id,
      path: item.path,
      loc,
      rawSpecifiers,
    };
  });
}

export function computeGraphData(
  files: Array<{ id: string; path: string; rawSpecifiers: RawSpecifier[] }>,
  allFilePaths: string[],
  aliases?: TsConfigAliases
): DependencyGraphData {
  return buildDependencyGraph(files, new Set(allFilePaths), aliases);
}
