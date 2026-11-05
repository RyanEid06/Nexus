import { describe, expect, it } from 'vitest';
import { analysisCategoryFor, getDirectoryColor, isAnalyzableText, isSensitiveTextFile, languageFor } from '../src/utils/fileTypes';

describe('file type analysis rules', () => {
  it('recognizes extensionless developer files', () => {
    expect(isAnalyzableText('Dockerfile')).toBe(true);
    expect(languageFor('Makefile')).toBe('Makefile');
  });

  it('separates tests/config/docs and avoids reading sensitive files', () => {
    expect(analysisCategoryFor('app/tests/user.test.ts', 'user.test.ts')).toBe('test');
    expect(analysisCategoryFor('app/README.md', 'README.md')).toBe('documentation');
    expect(analysisCategoryFor('app/tsconfig.json', 'tsconfig.json')).toBe('configuration');
    expect(isSensitiveTextFile('.env.production')).toBe(true);
    expect(isSensitiveTextFile('release.keystore')).toBe(true);
  });

  it('provides consistent palette colors for directory categories', () => {
    expect(getDirectoryColor('components')).toBe('#38BDF8');
    expect(getDirectoryColor('src')).toBe('#3B82F6');
    expect(getDirectoryColor('tests')).toBe('#F59E0B');
    expect(getDirectoryColor('unknown_folder_xyz')).toBeDefined();
  });
});
