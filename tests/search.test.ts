import { describe, expect, it } from 'vitest';
import { rankNode } from '../src/components/SearchPage';

describe('Search Ranking & Subsequence Matching', () => {
  it('ranks exact name match highest (score 0)', () => {
    const score = rankNode('App.tsx', 'src/App.tsx', 'app.tsx');
    expect(score).toBe(0);
  });

  it('ranks prefix match higher than substring (exact < prefix < substring)', () => {
    const prefixScore = rankNode('App.tsx', 'src/App.tsx', 'app');
    const substringScore = rankNode('WebApp.tsx', 'src/WebApp.tsx', 'app');

    expect(prefixScore).toBe(1);
    expect(substringScore).toBe(2);
    expect(prefixScore).toBeLessThan(substringScore);
  });

  it('ranks substring higher than fuzzy subsequence', () => {
    const substringScore = rankNode('Router.tsx', 'src/Router.tsx', 'out');
    const fuzzyScore = rankNode('Router.tsx', 'src/Router.tsx', 'rt'); // 'R'..'t' subsequence

    expect(substringScore).toBe(2);
    expect(fuzzyScore).toBe(3);
    expect(substringScore).toBeLessThan(fuzzyScore);
  });

  it('matches paths when name does not contain query', () => {
    const score = rankNode('index.ts', 'src/services/api/index.ts', 'services');
    expect(score).toBe(5);
  });

  it('returns 99 for non-matching queries', () => {
    const score = rankNode('index.ts', 'src/index.ts', 'zzzzzzzz');
    expect(score).toBe(99);
  });

  it('is completely deterministic', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(rankNode('Dashboard.tsx', 'src/components/Dashboard.tsx', 'dash')).toBe(1);
    }
  });
});
