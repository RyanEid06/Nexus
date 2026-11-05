import { describe, expect, it } from 'vitest';
import { DEFAULT_IGNORED_DIRECTORIES, DEFAULT_IGNORED_FILES, normalizeExclusionPath, shouldIgnoreEntry } from '../src/services/ignoreRules';

describe('ignoreRules & exclusion path semantics', () => {
  it('skips generated dependency and build directories', () => {
    expect(shouldIgnoreEntry('node_modules', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('.git', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('build', 'directory')).toBe(true);
    expect(shouldIgnoreEntry('src', 'directory')).toBe(false);
  });

  it('normalizeExclusionPath sanitizes paths correctly', () => {
    expect(normalizeExclusionPath('vendor')).toBe('vendor');
    expect(normalizeExclusionPath('  vendor  ')).toBe('vendor');
    expect(normalizeExclusionPath('./src/test')).toBe('src/test');
    expect(normalizeExclusionPath('src\\\\components')).toBe('src/components');
    expect(normalizeExclusionPath('/dist/')).toBe('dist');
    expect(normalizeExclusionPath('a///b///c')).toBe('a/b/c');

    // Rejects directory traversal
    expect(normalizeExclusionPath('..')).toBeNull();
    expect(normalizeExclusionPath('../secret')).toBeNull();
    expect(normalizeExclusionPath('foo/../bar')).toBeNull();
    expect(normalizeExclusionPath('foo/..')).toBeNull();
    expect(normalizeExclusionPath('.')).toBeNull();
    expect(normalizeExclusionPath('')).toBeNull();
    expect(normalizeExclusionPath('   ')).toBeNull();
    expect(normalizeExclusionPath('///')).toBeNull();
  });

  it('matches custom exclusions when path is omitted (basename fallback)', () => {
    const exclusions = new Set(['fixtures', 'cache']);
    expect(shouldIgnoreEntry('fixtures', 'directory', exclusions)).toBe(true);
    expect(shouldIgnoreEntry('cache', 'directory', exclusions)).toBe(true);
    expect(shouldIgnoreEntry('main.ts', 'file', exclusions)).toBe(false);
  });

  it('matches custom exclusions when project-relative path is provided', () => {
    const exclusions = new Set(['fixtures', 'temp/data', 'packages/legacy']);

    // 1. Basename matches
    expect(shouldIgnoreEntry('fixtures', 'directory', 'src/tests/fixtures', exclusions)).toBe(true);

    // 2. Full project-relative path matches
    expect(shouldIgnoreEntry('data', 'directory', 'temp/data', exclusions)).toBe(true);

    // 3. Subtree prefix matches
    expect(shouldIgnoreEntry('cache.json', 'file', 'temp/data/cache.json', exclusions)).toBe(true);
    expect(shouldIgnoreEntry('deep.ts', 'file', 'packages/legacy/generated/deep.ts', exclusions)).toBe(true);

    // Non-matching paths
    expect(shouldIgnoreEntry('index.ts', 'file', 'src/index.ts', exclusions)).toBe(false);
    expect(shouldIgnoreEntry('data', 'directory', 'app/data', exclusions)).toBe(false);
  });
});
