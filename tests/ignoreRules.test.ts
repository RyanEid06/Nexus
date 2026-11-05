import { describe, expect, it } from 'vitest';
import { shouldIgnoreEntry } from '../src/services/ignoreRules';

describe('default ignore rules', () => {
  it('skips generated dependency and build directories', () => {
    expect(shouldIgnoreEntry('node_modules', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('.git', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('build', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('src', 'directory')).toBe(false);
  });
});
