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
  });
});
