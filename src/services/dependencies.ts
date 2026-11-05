/**
 * NEXUS TypeScript/JavaScript Dependency Parser & Resolution Engine
 * Token-aware lexical scanning, canonical project-relative resolution,
 * and Tarjan's Strongly Connected Components (SCC) circular dependency detection.
 */

import type { DependencyEdge, DependencyGraphData, DependencyType, RawSpecifier } from '../domain/models';
import { parseTsConfigAliases, type TsConfigAliases } from '../utils/jsonc';

export type { RawSpecifier, TsConfigAliases, DependencyType };
export { parseTsConfigAliases };

/**
 * Normalizes a POSIX relative path:
 * Removes redundant '.', '..', and duplicate slashes.
 * Returns clean relative path without leading slash.
 */
export function normalizeRelativePath(path: string): string {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else {
        stack.push('..');
      }
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

/**
 * Extracts directory name of a relative file path.
 * e.g. "src/components/Sidebar.tsx" -> "src/components"
 * e.g. "main.ts" -> ""
 */
export function getDirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
}

/**
 * Extracts external package name from a specifier.
 * e.g. "react" -> "react"
 * e.g. "react/jsx-runtime" -> "react"
 * e.g. "@react-three/fiber" -> "@react-three/fiber"
 * e.g. "@react-three/fiber/dist/index.js" -> "@react-three/fiber"
 */
export function extractPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const segments = specifier.split('/');
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : specifier;
  }
  return specifier.split('/')[0];
}

function isIdentifierChar(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

/**
 * Token-aware lexical scanner to extract import, export-from, and require specifiers.
 * Completely immune to comments, strings containing fake imports, template literals,
 * multiline formatting, and escaped quotes.
 */
export function extractSpecifiers(sourceText: string): RawSpecifier[] {
  const results: RawSpecifier[] = [];
  const len = sourceText.length;
  let i = 0;

  function skipWhitespaceAndComments(): void {
    while (i < len) {
      const ch = sourceText[i];
      const next = i + 1 < len ? sourceText[i + 1] : '';

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        i++;
        continue;
      }

      // Single-line comment
      if (ch === '/' && next === '/') {
        i += 2;
        while (i < len && sourceText[i] !== '\n' && sourceText[i] !== '\r') {
          i++;
        }
        continue;
      }

      // Multi-line comment
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < len && !(sourceText[i] === '*' && i + 1 < len && sourceText[i + 1] === '/')) {
          i++;
        }
        i += 2;
        continue;
      }

      break;
    }
  }

  function readString(): string | null {
    if (i >= len) return null;
    const quote = sourceText[i];
    if (quote !== '"' && quote !== "'") return null;
    i++;
    let val = '';
    while (i < len) {
      const ch = sourceText[i];
      if (ch === '\\' && i + 1 < len) {
        val += sourceText[i + 1];
        i += 2;
      } else if (ch === quote) {
        i++;
        return val;
      } else {
        val += ch;
        i++;
      }
    }
    return null;
  }

  function skipNormalString(quote: string): void {
    i++;
    while (i < len) {
      const ch = sourceText[i];
      if (ch === '\\' && i + 1 < len) {
        i += 2;
      } else if (ch === quote) {
        i++;
        break;
      } else {
        i++;
      }
    }
  }

  function skipTemplateLiteral(): void {
    i++; // skip initial `
    while (i < len) {
      const ch = sourceText[i];
      if (ch === '\\' && i + 1 < len) {
        i += 2;
      } else if (ch === '`') {
        i++;
        break;
      } else if (ch === '$' && i + 1 < len && sourceText[i + 1] === '{') {
        // Embedded JS expression inside template literal!
        // Recursively scan JS expression until matching closing }
        i += 2;
        let braceDepth = 1;
        while (i < len && braceDepth > 0) {
          skipWhitespaceAndComments();
          if (i >= len) break;
          const exprCh = sourceText[i];
          if (exprCh === '{') {
            braceDepth++;
            i++;
          } else if (exprCh === '}') {
            braceDepth--;
            i++;
          } else if (exprCh === '"' || exprCh === "'") {
            skipNormalString(exprCh);
          } else if (exprCh === '`') {
            skipTemplateLiteral();
          } else if (exprCh === 'i' && sourceText.startsWith('import', i) && !isIdentifierChar(sourceText[i + 6] || '')) {
            // Dynamic import inside template expression!
            i += 6;
            skipWhitespaceAndComments();
            if (sourceText[i] === '(') {
              i++;
              skipWhitespaceAndComments();
              const spec = readString();
              if (spec !== null) {
                results.push({ specifier: spec, type: 'dynamic-import' });
              }
            }
          } else {
            i++;
          }
        }
      } else {
        i++;
      }
    }
  }

  let prevChar = '';

  while (i < len) {
    skipWhitespaceAndComments();
    if (i >= len) break;

    const ch = sourceText[i];

    // String literals outside import: skip safely
    if (ch === '"' || ch === "'") {
      skipNormalString(ch);
      prevChar = ch;
      continue;
    }

    // Template literals: skip safely
    if (ch === '`') {
      skipTemplateLiteral();
      prevChar = ch;
      continue;
    }

    // Check for "require" keyword
    if (ch === 'r' && sourceText.startsWith('require', i) && !isIdentifierChar(sourceText[i + 7] || '')) {
      const isMethodCall = prevChar === '.';
      i += 7;
      if (!isMethodCall) {
        skipWhitespaceAndComments();
        if (sourceText[i] === '(') {
          i++;
          skipWhitespaceAndComments();
          const spec = readString();
          if (spec !== null) {
            results.push({ specifier: spec, type: 'require' });
          }
        }
      }
      prevChar = 'e';
      continue;
    }

    // Check for "import" keyword
    if (ch === 'i' && sourceText.startsWith('import', i) && !isIdentifierChar(sourceText[i + 6] || '')) {
      const isMember = prevChar === '.';
      i += 6;
      if (!isMember) {
        skipWhitespaceAndComments();

        // Pattern 1: dynamic import('...')
        if (sourceText[i] === '(') {
          i++;
          skipWhitespaceAndComments();
          const spec = readString();
          if (spec !== null) {
            results.push({ specifier: spec, type: 'dynamic-import' });
          }
          prevChar = ')';
          continue;
        }

        // Pattern 2: side-effect import '...'
        if (sourceText[i] === '"' || sourceText[i] === "'") {
          const spec = readString();
          if (spec !== null) {
            results.push({ specifier: spec, type: 'side-effect' });
          }
          prevChar = ';';
          continue;
        }

        // Pattern 3: static import (single-line or multiline, with or without 'type')
        // Scan forward looking for 'from' keyword before next top-level statement
        let foundFrom = false;
        while (i < len) {
          skipWhitespaceAndComments();
          if (i >= len) break;

          const curr = sourceText[i];

          // If statement ended with semicolon without 'from', stop
          if (curr === ';') {
            i++;
            break;
          }

          // Skip string literals inside import clause
          if (curr === '"' || curr === "'") {
            skipNormalString(curr);
            continue;
          }

          // Check for 'from' keyword
          if (curr === 'f' && sourceText.startsWith('from', i) && !isIdentifierChar(sourceText[i + 4] || '')) {
            i += 4;
            foundFrom = true;
            break;
          }

          i++;
        }

        if (foundFrom) {
          skipWhitespaceAndComments();
          const spec = readString();
          if (spec !== null) {
            results.push({ specifier: spec, type: 'static-import' });
          }
        }
      }
      prevChar = 't';
      continue;
    }

    // Check for "export" keyword
    if (ch === 'e' && sourceText.startsWith('export', i) && !isIdentifierChar(sourceText[i + 6] || '')) {
      i += 6;
      skipWhitespaceAndComments();

      // Check if this is a re-export: export ... from '...'
      let foundFrom = false;
      while (i < len) {
        skipWhitespaceAndComments();
        if (i >= len) break;

        const curr = sourceText[i];

        // Semicolon or new declaration keyword marks end
        if (curr === ';') {
          i++;
          break;
        }

        if (curr === '"' || curr === "'") {
          skipNormalString(curr);
          continue;
        }

        if (curr === 'f' && sourceText.startsWith('from', i) && !isIdentifierChar(sourceText[i + 4] || '')) {
          i += 4;
          foundFrom = true;
          break;
        }

        i++;
      }

      if (foundFrom) {
        skipWhitespaceAndComments();
        const spec = readString();
        if (spec !== null) {
          results.push({ specifier: spec, type: 'export-from' });
        }
      }

      prevChar = 't';
      continue;
    }

    prevChar = ch;
    i++;
  }

  return results;
}

/**
 * Resolves an import specifier against canonical project-relative file paths.
 */
export function resolveSpecifier(
  importerPath: string,
  specifier: string,
  allFilePaths: Set<string>,
  aliases?: TsConfigAliases
): { targetPath: string; isExternal: boolean; isResolved: boolean } {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';
  const isAbsolute = specifier.startsWith('/');

  // 1. Try explicit tsconfig / jsconfig alias mappings
  if (aliases?.paths && !isRelative && !isAbsolute) {
    for (const [pattern, targets] of Object.entries(aliases.paths)) {
      const starIdx = pattern.indexOf('*');
      if (starIdx !== -1) {
        const prefix = pattern.slice(0, starIdx);
        const suffix = pattern.slice(starIdx + 1);
        if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
          const wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
          for (const target of targets) {
            const candidate = target.replace('*', wildcard);
            const resolved = testCandidatePath(candidate, allFilePaths, aliases.baseUrl);
            if (resolved) {
              return { targetPath: resolved, isExternal: false, isResolved: true };
            }
          }
        }
      } else if (pattern === specifier) {
        for (const target of targets) {
          const resolved = testCandidatePath(target, allFilePaths, aliases.baseUrl);
          if (resolved) {
            return { targetPath: resolved, isExternal: false, isResolved: true };
          }
        }
      }
    }
  }

  // 2. Default Vite/Next alias fallback `@/*` -> `src/*` or `./*` if not overridden
  if (specifier.startsWith('@/') && (!aliases?.paths || !aliases.paths['@/*'])) {
    const sub = specifier.slice(2);
    const candidateSrc = testCandidatePath(`src/${sub}`, allFilePaths);
    if (candidateSrc) return { targetPath: candidateSrc, isExternal: false, isResolved: true };
    const candidateRoot = testCandidatePath(sub, allFilePaths);
    if (candidateRoot) return { targetPath: candidateRoot, isExternal: false, isResolved: true };
  }

  // 3. baseUrl resolution
  if (aliases?.baseUrl && !isRelative && !isAbsolute) {
    const baseCandidate = testCandidatePath(specifier, allFilePaths, aliases.baseUrl);
    if (baseCandidate) {
      return { targetPath: baseCandidate, isExternal: false, isResolved: true };
    }
  }

  // 4. Relative resolution
  if (isRelative) {
    const dir = getDirname(importerPath);
    const combined = dir ? `${dir}/${specifier}` : specifier;
    const resolved = testCandidatePath(combined, allFilePaths);
    if (resolved) {
      return { targetPath: resolved, isExternal: false, isResolved: true };
    }
    // Unresolved relative import
    return { targetPath: normalizeRelativePath(combined), isExternal: false, isResolved: false };
  }

  // 5. External npm package
  return {
    targetPath: extractPackageName(specifier),
    isExternal: true,
    isResolved: true,
  };
}

/**
 * Tests candidate path variants against indexed project file paths.
 */
export function testCandidatePath(candidate: string, allFilePaths: Set<string>, baseUrl?: string): string | null {
  const norm = normalizeRelativePath(baseUrl && baseUrl !== '.' ? `${baseUrl}/${candidate}` : candidate);

  // Exact match
  if (allFilePaths.has(norm)) return norm;

  // TypeScript / JSX substitutions
  if (norm.endsWith('.js')) {
    const base = norm.slice(0, -3);
    if (allFilePaths.has(`${base}.ts`)) return `${base}.ts`;
    if (allFilePaths.has(`${base}.tsx`)) return `${base}.tsx`;
  }
  if (norm.endsWith('.jsx')) {
    const base = norm.slice(0, -4);
    if (allFilePaths.has(`${base}.tsx`)) return `${base}.tsx`;
  }

  // Extension candidates
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts', '.json', '.css'];
  for (const ext of extensions) {
    const withExt = `${norm}${ext}`;
    if (allFilePaths.has(withExt)) return withExt;
  }

  // Index file candidates
  const indexCandidates = [
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
    '/index.mjs',
    '/index.cjs',
  ];
  for (const idx of indexCandidates) {
    const withIndex = `${norm}${idx}`;
    if (allFilePaths.has(withIndex)) return withIndex;
  }

  return null;
}

/**
 * Builds the complete DependencyGraphData from analyzed files and their raw specifiers.
 */
export function buildDependencyGraph(
  analyzedFiles: Array<{ id: string; path: string; text?: string; rawSpecifiers?: RawSpecifier[] }>,
  allFilePaths: Set<string>,
  aliases?: TsConfigAliases
): DependencyGraphData {
  const pathToId = new Map<string, string>();
  for (const file of analyzedFiles) {
    pathToId.set(file.path, file.id);
  }

  const allEdges: DependencyEdge[] = [];
  const externalPackagesSet = new Set<string>();

  for (const file of analyzedFiles) {
    // Get raw specifiers either from provided array or parse from text
    const rawSpecifiers = file.rawSpecifiers ?? (file.text ? extractSpecifiers(file.text) : []);

    for (let idx = 0; idx < rawSpecifiers.length; idx++) {
      const raw = rawSpecifiers[idx];
      const resolved = resolveSpecifier(file.path, raw.specifier, allFilePaths, aliases);
      const targetId = !resolved.isExternal && resolved.isResolved ? pathToId.get(resolved.targetPath) : undefined;

      if (resolved.isExternal) {
        externalPackagesSet.add(resolved.targetPath);
      }

      allEdges.push({
        id: `dep:${file.id}:${idx}:${raw.specifier}`,
        sourceId: file.id,
        sourcePath: file.path,
        targetId,
        targetPath: resolved.targetPath,
        specifier: raw.specifier,
        type: raw.type,
        isExternal: resolved.isExternal,
        isResolved: resolved.isResolved,
      });
    }
  }

  const circularDependencies = findCircularDependencies(allEdges);
  const externalPackages = Array.from(externalPackagesSet).sort();

  return {
    edges: allEdges,
    circularDependencies,
    externalPackages,
  };
}

/**
 * Implements real Tarjan's Strongly Connected Components (SCC) algorithm.
 * Identifies all strongly connected component groups that contain circular dependencies.
 * An SCC is circular if:
 * 1) It contains more than 1 module; OR
 * 2) It contains 1 module that has a self-loop (imports itself).
 * Returns array of circular module groups, each sorted alphabetically.
 */
export function findCircularDependencies(edges: DependencyEdge[]): string[][] {
  const adj = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!edge.isExternal && edge.isResolved && edge.targetPath) {
      let set = adj.get(edge.sourcePath);
      if (!set) {
        set = new Set();
        adj.set(edge.sourcePath, set);
      }
      set.add(edge.targetPath);
    }
  }

  let currentIndex = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Map<string, boolean>();
  const stack: string[] = [];
  const circularSCCs: string[][] = [];

  function strongConnect(u: string): void {
    indices.set(u, currentIndex);
    lowlinks.set(u, currentIndex);
    currentIndex++;
    stack.push(u);
    onStack.set(u, true);

    const neighbors = adj.get(u);
    if (neighbors) {
      for (const v of neighbors) {
        if (!indices.has(v)) {
          // Successor v has not yet been visited; recurse on it
          strongConnect(v);
          lowlinks.set(u, Math.min(lowlinks.get(u)!, lowlinks.get(v)!));
        } else if (onStack.get(v)) {
          // Successor v is in stack and hence in the current SCC
          lowlinks.set(u, Math.min(lowlinks.get(u)!, indices.get(v)!));
        }
      }
    }

    // If u is a root node, pop the stack and generate an SCC
    if (lowlinks.get(u) === indices.get(u)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.set(w, false);
        scc.push(w);
      } while (w !== u);

      // A component is circular if it has > 1 node, or has 1 node with a self-loop
      if (scc.length > 1) {
        circularSCCs.push(scc.sort());
      } else if (scc.length === 1 && adj.get(u)?.has(u)) {
        circularSCCs.push([u]);
      }
    }
  }

  for (const node of adj.keys()) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  // Sort components by size (descending) and first element (alphabetically)
  return circularSCCs.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/**
 * Finds the shortest dependency path between two module relative paths using Breadth-First Search (BFS).
 */
export function findShortestDependencyPath(
  sourcePath: string,
  targetPath: string,
  edges: DependencyEdge[]
): string[] | null {
  if (sourcePath === targetPath) return [sourcePath];

  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.isExternal && edge.isResolved && edge.targetPath) {
      if (!adj.has(edge.sourcePath)) adj.set(edge.sourcePath, new Set());
      adj.get(edge.sourcePath)!.add(edge.targetPath);
    }
  }

  const queue: string[][] = [[sourcePath]];
  const visited = new Set<string>([sourcePath]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];

    const neighbors = adj.get(last);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (neighbor === targetPath) {
          return [...path, targetPath];
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
  }

  return null;
}
