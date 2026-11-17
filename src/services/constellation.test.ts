import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMultiProjectConstellation } from './constellation';
import { CURATED_SAMPLE_PROJECTS } from '../data/sampleProjects';

describe('computeMultiProjectConstellation', () => {
  it('handles an empty project list cleanly', () => {
    const model = computeMultiProjectConstellation([]);
    assert.equal(model.projects.length, 0);
    assert.equal(model.nodes.length, 0);
    assert.equal(model.totals.files, 0);
  });

  it('places multiple projects into non-overlapping 2D and 3D orbital clusters with shared package bridges', () => {
    const model = computeMultiProjectConstellation(CURATED_SAMPLE_PROJECTS);
    assert.equal(model.projects.length, 3);
    assert.ok(model.nodes.length > 3);

    // Check non-overlapping cluster centers in 2D and 3D
    for (let i = 0; i < model.projects.length; i += 1) {
      for (let j = i + 1; j < model.projects.length; j += 1) {
        const a = model.projects[i];
        const b = model.projects[j];
        const dist2D = Math.hypot(a.center2D.x - b.center2D.x, a.center2D.y - b.center2D.y);
        assert.ok(
          dist2D >= a.radius2D + b.radius2D,
          `Clusters ${a.name} and ${b.name} overlap in 2D: dist=${dist2D}`
        );

        const dist3D = Math.hypot(
          a.center3D[0] - b.center3D[0],
          a.center3D[1] - b.center3D[1],
          a.center3D[2] - b.center3D[2]
        );
        assert.ok(
          dist3D >= a.radius3D + b.radius3D,
          `Clusters ${a.name} and ${b.name} overlap in 3D: dist=${dist3D}`
        );
      }
    }

    // Atlas Demo + Helios Engine share 'three', Atlas Demo + Vortex Gateway share 'react'
    const sharedNames = model.sharedPackages.map((p) => p.name);
    assert.ok(sharedNames.includes('three'));
    assert.ok(sharedNames.includes('react'));
    assert.equal(model.totals.circularCycles, 1);
  });

  it('produces identical deterministic coordinates across repeated runs', () => {
    const first = computeMultiProjectConstellation(CURATED_SAMPLE_PROJECTS);
    const second = computeMultiProjectConstellation([...CURATED_SAMPLE_PROJECTS].reverse());

    assert.equal(first.projects.length, second.projects.length);
    for (let i = 0; i < first.nodes.length; i += 1) {
      assert.equal(first.nodes[i].id, second.nodes[i].id);
      assert.equal(first.nodes[i].x, second.nodes[i].x);
      assert.equal(first.nodes[i].y, second.nodes[i].y);
    }
  });
});
