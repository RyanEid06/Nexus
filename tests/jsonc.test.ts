import { describe, expect, it } from 'vitest';
import { parseJsonc, parseTsConfigAliases, stripJsonc } from '../src/utils/jsonc';

describe('JSONC Parser', () => {
  it('strips single-line and multi-line comments while preserving strings', () => {
    const jsonc = `
      {
        // Single-line comment
        /* Multi-line
           comment */
        "url": "https://example.com/api/test", // String with //
        "glob": "src/*" /* String with /* */
      }
    `;

    const parsed = parseJsonc<{ url: string; glob: string }>(jsonc);
    expect(parsed.url).toBe('https://example.com/api/test');
    expect(parsed.glob).toBe('src/*');
  });

  it('strips trailing commas in objects and arrays safely', () => {
    const jsonc = `
      {
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": [
              "src/*",
            ],
          },
        },
      }
    `;

    const parsed = parseJsonc<{ compilerOptions: { baseUrl: string; paths: Record<string, string[]> } }>(jsonc);
    expect(parsed.compilerOptions.baseUrl).toBe('.');
    expect(parsed.compilerOptions.paths['@/*']).toEqual(['src/*']);
  });

  it('extracts tsconfig aliases with normalized baseUrl and path mappings', () => {
    const tsconfig = `
      // TSConfig configuration
      {
        "compilerOptions": {
          "target": "ESNext",
          "baseUrl": "./", // Base directory
          "paths": {
            "@/*": ["src/*",],
            "@components/*": ["src/components/*"],
          },
        },
      }
    `;

    const aliases = parseTsConfigAliases(tsconfig);
    expect(aliases.baseUrl).toBe('');
    expect(aliases.paths).toBeDefined();
    expect(aliases.paths?.['@/*']).toEqual(['src/*']);
    expect(aliases.paths?.['@components/*']).toEqual(['src/components/*']);
  });

  it('gracefully handles invalid JSONC without crashing', () => {
    expect(parseTsConfigAliases('{ broken json')).toEqual({});
    expect(parseTsConfigAliases('')).toEqual({});
  });
});
