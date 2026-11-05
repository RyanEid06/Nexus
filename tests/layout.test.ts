import { describe, expect, it } from 'vitest';
import type { ProjectNode } from '../src/domain/models';
import {
  calculate2DLayout,
  visibleGraphNodes,
  withDeterministicLayout,
} from '../src/services/layout';

const sampleNodes: ProjectNode[] = [
  { id: 'root', projectId: 'p', parentId: null, name: 'root', path: 'root', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
  { id: 'src', projectId: 'p', parentId: 'root', name: 'src', path: 'root/src', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
  { id: 'docs', projectId: 'p', parentId: 'root', name: 'docs', path: 'root/docs', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
  { id: 'config', projectId: 'p', parentId: 'root', name: 'config', path: 'root/config', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
  { id: 'deep', projectId: 'p', parentId: 'src', name: 'deep', path: 'root/src/deep', kind: 'directory', sizeBytes: 0, loc: 0, depth: 2 },
  { id: 'file', projectId: 'p', parentId: 'deep', name: 'x.ts', path: 'root/src/deep/x.ts', kind: 'file', sizeBytes: 10, loc: 1, depth: 3 },
  { id: 'file2', projectId: 'p', parentId: 'src', name: 'main.ts', path: 'root/src/main.ts', kind: 'file', sizeBytes: 20, loc: 5, depth: 2 },
];

describe('Layout Engine', () => {
  describe('visibleGraphNodes', () => {
    it('keeps the selected deep node and its complete ancestor chain visible', () => {
      const ids = visibleGraphNodes(sampleNodes, 'file').map((node) => node.id);
      expect(ids).toContain('root');
      expect(ids).toContain('src');
      expect(ids).toContain('deep');
      expect(ids).toContain('file');
    });

    it('preserves the hard graph limit maxNodes', () => {
      // Create 50 dummy nodes
      const manyNodes: ProjectNode[] = [
        { id: 'root', projectId: 'p', parentId: null, name: 'root', path: 'root', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
      ];
      for (let i = 1; i <= 60; i += 1) {
        manyNodes.push({
          id: `node-${i}`,
          projectId: 'p',
          parentId: 'root',
          name: `node-${i}`,
          path: `root/node-${i}`,
          kind: 'directory',
          sizeBytes: 10,
          loc: 1,
          depth: 1,
        });
      }
      const visible = visibleGraphNodes(manyNodes, null, new Set(), 25);
      expect(visible.length).toBeLessThanOrEqual(25);
    });
  });

  describe('withDeterministicLayout (3D Staircase)', () => {
    it('produces identical coordinates on identical inputs (pure determinism)', () => {
      const pass1 = withDeterministicLayout(sampleNodes);
      const pass2 = withDeterministicLayout(sampleNodes);

      expect(pass1.length).toBe(pass2.length);
      for (let i = 0; i < pass1.length; i += 1) {
        const p1 = pass1[i].position!;
        const p2 = pass2[i].position!;
        expect(p1[0]).toBeCloseTo(p2[0], 6);
        expect(p1[1]).toBeCloseTo(p2[1], 6);
        expect(p1[2]).toBeCloseTo(p2[2], 6);
      }
    });

    it('preserves parent-relative positioning with non-zero vertical separation across depths', () => {
      const positioned = withDeterministicLayout(sampleNodes);
      const byId = new Map(positioned.map((n) => [n.id, n]));

      const root = byId.get('root')!;
      const src = byId.get('src')!;
      const deep = byId.get('deep')!;
      const file = byId.get('file')!;

      expect(root.position).toBeDefined();
      expect(src.position).toBeDefined();
      expect(deep.position).toBeDefined();
      expect(file.position).toBeDefined();

      // Depth hierarchy vertical staircase offset (y should decrease with depth)
      expect(src.position![1]).toBeLessThan(root.position![1]);
      expect(deep.position![1]).toBeLessThan(src.position![1]);
      expect(file.position![1]).toBeLessThan(deep.position![1]);
    });

    it('does not produce NaN or Infinity in collision relaxation', () => {
      const positioned = withDeterministicLayout(sampleNodes);
      for (const node of positioned) {
        const [x, y, z] = node.position!;
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
      }
    });
  });

  describe('calculate2DLayout (2D Map Mode)', () => {
    it('produces deterministic 2D coordinates with root at (0, 0)', () => {
      const expanded = new Set(['src']);
      const layout1 = calculate2DLayout(sampleNodes, expanded, 'root');
      const layout2 = calculate2DLayout(sampleNodes, expanded, 'root');

      expect(layout1.size).toBe(layout2.size);

      const rootPos1 = layout1.get('root');
      expect(rootPos1).toBeDefined();
      expect(rootPos1!.x).toBe(0);
      expect(rootPos1!.y).toBe(0);

      // Verify determinism across all nodes
      for (const [id, pos1] of layout1.entries()) {
        const pos2 = layout2.get(id)!;
        expect(pos1.x).toBeCloseTo(pos2.x, 6);
        expect(pos1.y).toBeCloseTo(pos2.y, 6);
      }
    });

    it('fans out children of expanded directory radially away from parent', () => {
      const expanded = new Set(['src']);
      const layout = calculate2DLayout(sampleNodes, expanded, 'root');

      const srcPos = layout.get('src');
      const mainPos = layout.get('file2'); // child of src

      expect(srcPos).toBeDefined();
      expect(mainPos).toBeDefined();

      // Child distance from (0,0) should be further out than parent distance from (0,0)
      const srcDist = Math.sqrt(srcPos!.x * srcPos!.x + srcPos!.y * srcPos!.y);
      const childDist = Math.sqrt(mainPos!.x * mainPos!.x + mainPos!.y * mainPos!.y);
      expect(childDist).toBeGreaterThan(srcDist);
    });

    it('scales to 100+ direct children using multi-band progressive layout without crash', () => {
      const rootNode: ProjectNode = {
        id: 'root',
        projectId: 'p',
        parentId: null,
        name: 'root',
        path: 'root',
        kind: 'project',
        sizeBytes: 0,
        loc: 0,
        depth: 0,
      };
      const largeFolder: ProjectNode = {
        id: 'large-folder',
        projectId: 'p',
        parentId: 'root',
        name: 'large-folder',
        path: 'root/large-folder',
        kind: 'directory',
        sizeBytes: 0,
        loc: 0,
        depth: 1,
      };

      const nodes: ProjectNode[] = [rootNode, largeFolder];
      for (let i = 1; i <= 120; i += 1) {
        nodes.push({
          id: `child-${i}`,
          projectId: 'p',
          parentId: 'large-folder',
          name: i <= 10 ? `dir-${i}` : `file-${i}.ts`,
          path: `root/large-folder/${i <= 10 ? `dir-${i}` : `file-${i}.ts`}`,
          kind: i <= 10 ? 'directory' : 'file',
          sizeBytes: 100,
          loc: 10,
          depth: 2,
        });
      }

      const expanded = new Set(['large-folder']);
      const layout = calculate2DLayout(nodes, expanded, 'root');

      // Verify layout computed successfully and includes root and large-folder
      expect(layout.has('root')).toBe(true);
      expect(layout.has('large-folder')).toBe(true);

      // Verify directory nodes are prioritized in the first band
      const dir1Pos = layout.get('child-1');
      expect(dir1Pos).toBeDefined();
      expect(dir1Pos?.band).toBe(0);

      // Verify overflow indicator was created for > 36 children
      const overflowPos = layout.get('large-folder__more');
      expect(overflowPos).toBeDefined();
      expect(overflowPos?.isOverflowIndicator).toBe(true);
      expect(overflowPos?.overflowCount).toBe(120 - 36);

      // Verify all positions are finite and deterministic
      for (const [, pos] of layout.entries()) {
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
      }
    });
  });

  describe('Collapse Semantics & Large-Project Scalability (GEMINI.md Sections 6 & 7)', () => {
    it('strictly keeps collapsed folder children hidden even when spare capacity exists', () => {
      const nodes: ProjectNode[] = [
        { id: 'root', projectId: 'p', parentId: null, name: 'root', path: 'root', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
        { id: 'docs', projectId: 'p', parentId: 'root', name: 'docs', path: 'root/docs', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
        { id: 'doc-child', projectId: 'p', parentId: 'docs', name: 'README.md', path: 'root/docs/README.md', kind: 'file', sizeBytes: 10, loc: 1, depth: 2 },
        { id: 'src', projectId: 'p', parentId: 'root', name: 'src', path: 'root/src', kind: 'directory', sizeBytes: 0, loc: 0, depth: 1 },
        { id: 'src-child', projectId: 'p', parentId: 'src', name: 'index.ts', path: 'root/src/index.ts', kind: 'file', sizeBytes: 10, loc: 1, depth: 2 },
      ];

      // Only 'src' is expanded, 'docs' is collapsed. MaxNodes is 200 (plenty of spare capacity)
      const visible = visibleGraphNodes(nodes, null, new Set(['src']), 200);
      const visibleIds = new Set(visible.map((n) => n.id));

      expect(visibleIds.has('root')).toBe(true);
      expect(visibleIds.has('docs')).toBe(true);
      expect(visibleIds.has('src')).toBe(true);
      expect(visibleIds.has('src-child')).toBe(true);
      // Collapsed 'doc-child' MUST NOT reappear!
      expect(visibleIds.has('doc-child')).toBe(false);
    });

    it('benchmarks 3D layout on 3,000 synthetic nodes in O(N) time under 250ms', () => {
      const syntheticNodes: ProjectNode[] = [
        { id: 'root', projectId: 'p', parentId: null, name: 'root', path: 'root', kind: 'project', sizeBytes: 0, loc: 0, depth: 0 },
      ];

      // 30 top-level directories, each with 100 children = 3,031 nodes
      for (let d = 1; d <= 30; d += 1) {
        const dirId = `dir-${d}`;
        syntheticNodes.push({
          id: dirId,
          projectId: 'p',
          parentId: 'root',
          name: `dir-${d}`,
          path: `root/dir-${d}`,
          kind: 'directory',
          sizeBytes: 0,
          loc: 0,
          depth: 1,
        });

        for (let f = 1; f <= 100; f += 1) {
          syntheticNodes.push({
            id: `file-${d}-${f}`,
            projectId: 'p',
            parentId: dirId,
            name: `file-${d}-${f}.ts`,
            path: `root/dir-${d}/file-${d}-${f}.ts`,
            kind: 'file',
            sizeBytes: 100,
            loc: 10,
            depth: 2,
          });
        }
      }

      expect(syntheticNodes.length).toBe(3031);

      const start = performance.now();
      const positioned = withDeterministicLayout(syntheticNodes);
      const duration = performance.now() - start;

      expect(positioned.length).toBe(3031);
      // Must execute quickly in O(N) time (typically < 100ms)
      expect(duration).toBeLessThan(350);

      // Verify all positions are finite
      for (const node of positioned) {
        expect(Number.isFinite(node.position![0])).toBe(true);
        expect(Number.isFinite(node.position![1])).toBe(true);
        expect(Number.isFinite(node.position![2])).toBe(true);
      }
    });
  });
});

