import { describe, expect, it } from 'vitest';
import { aggregateDirectoryStats, calculateMetrics } from '../src/services/metrics';
import type { ProjectNode } from '../src/domain/models';

const file = (id: string, parentId: string, language: string, loc: number, sizeBytes = 100): ProjectNode => ({
  id, projectId:'p', parentId, name:`${id}.ts`, path:`p/${id}.ts`, kind:'file', language, sizeBytes, loc, depth:2, analysisStatus:'analyzed',
});

describe('calculateMetrics', () => {
  it('separates indexed bytes from analyzed bytes and aggregates language percentages', () => {
    const metadataOnly = { ...file('c', 'root', 'TypeScript', 0, 200), analysisStatus: 'metadata-only' as const };
    const metrics = calculateMetrics([file('a','root','TypeScript',75), file('b','root','JavaScript',25), metadataOnly]);
    expect(metrics.totalLoc).toBe(100);
    expect(metrics.indexedBytes).toBe(400);
    expect(metrics.analyzedTextBytes).toBe(200);
    expect(metrics.metadataOnlyFiles).toBe(1);
    expect(metrics.languages[0].percentage).toBe(75);
  });
});

describe('aggregateDirectoryStats', () => {
  it('makes folder and project statistics recursive', () => {
    const nodes: ProjectNode[] = [
      { id:'root', projectId:'p', parentId:null, name:'p', path:'p', kind:'project', sizeBytes:0, loc:0, depth:0 },
      { id:'src', projectId:'p', parentId:'root', name:'src', path:'p/src', kind:'directory', sizeBytes:0, loc:0, depth:1 },
      { id:'deep', projectId:'p', parentId:'src', name:'deep', path:'p/src/deep', kind:'directory', sizeBytes:0, loc:0, depth:2 },
      file('a','deep','TypeScript',10,50),
    ];
    nodes[3].path = 'p/src/deep/a.ts'; nodes[3].depth = 3;
    const aggregated = aggregateDirectoryStats(nodes);
    const root = aggregated.find((node) => node.id === 'root')!;
    const src = aggregated.find((node) => node.id === 'src')!;
    expect(root.loc).toBe(10);
    expect(root.sizeBytes).toBe(50);
    expect(root.descendantFiles).toBe(1);
    expect(root.descendantFolders).toBe(2);
    expect(src.loc).toBe(10);
  });
});
