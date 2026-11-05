import { describe, expect, it } from 'vitest';
import type { ProjectNode } from '../src/domain/models';
import { visibleGraphNodes } from '../src/services/layout';

const nodes: ProjectNode[] = [
  { id:'root', projectId:'p', parentId:null, name:'p', path:'p', kind:'project', sizeBytes:0, loc:0, depth:0 },
  { id:'src', projectId:'p', parentId:'root', name:'src', path:'p/src', kind:'directory', sizeBytes:0, loc:0, depth:1 },
  { id:'deep', projectId:'p', parentId:'src', name:'deep', path:'p/src/deep', kind:'directory', sizeBytes:0, loc:0, depth:2 },
  { id:'file', projectId:'p', parentId:'deep', name:'x.ts', path:'p/src/deep/x.ts', kind:'file', sizeBytes:10, loc:1, depth:3 },
];

describe('visibleGraphNodes', () => {
  it('keeps the selected deep node and its complete ancestor chain visible', () => {
    const ids = visibleGraphNodes(nodes, 'file').map((node) => node.id);
    expect(ids).toContain('root');
    expect(ids).toContain('src');
    expect(ids).toContain('deep');
    expect(ids).toContain('file');
  });
});
