/**
 * NEXUS TypeScript/JavaScript Dependency Parser & Resolution Engine
 * 100% Client-side, deterministic, zero-fake-data.
 * Parses real static/dynamic imports, exports, and requires.
 */

import type { DependencyEdge, DependencyGraphData, DependencyType } from '../domain/models';

export interface RawSpecifier {
  specifier: string;
  type: DependencyType;
}

export interface TsConfigAliases {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

/**
 * Normalizes a POSIX relative path:
 * Removes redundant '.', '..', and duplicate slashes.
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

/**
 * Parses raw import/export/require specifiers from TS/JS source code.
 * Uses an efficient single-pass lexical scanner that ignores comments and non-import strings.
 */
export function extractSpecifiers(sourceText: string): RawSpecifier[] {
  const results: RawSpecifier[] = [];
  const len = sourceText.length;
  let i = 0;

  while (i < len) {
    const ch = sourceText[i];

    // Single-line comment: skip to newline
    if (ch === '/' && sourceText[i + 1] === '/') {
      i += 2;
      while (i < len && sourceText[i] !== '\n' && sourceText[i] !== '\r') {
        i += 1;
      }
      continue;
    }

    // Multi-line comment: skip to */
    if (ch === '/' && sourceText[i + 1] === '*') {
      i += 2;
      while (i < len && !(sourceText[i] === '*' && sourceText[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    // String literals not part of an import/require: skip string content safely
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < len && sourceText[i] !== quote) {
        if (sourceText[i] === '\\') i += 1; // escape
        i += 1;
      }
      i += 1;
      continue;
    }

    // Check for "import" keyword
    if (sourceText.startsWith('import', i) && isWordBoundary(sourceText, i, 6)) {
      const start = i;
      i += 6;
      // Scan forward to determine import pattern
      // Pattern 1: dynamic import(...)
      let k = i;
      while (k < len && (sourceText[k] === ' ' || sourceText[k] === '\t' || sourceText[k] === '\n' || sourceText[k] === '\r')) k += 1;
      if (sourceText[k] === '(') {
        k += 1;
        while (k < len && (sourceText[k] === ' ' || sourceText[k] === '\t' || sourceText[k] === '\n' || sourceText[k] === '\r')) k += 1;
        if (sourceText[k] === '"' || sourceText[k] === "'") {
          const spec = readStringLiteral(sourceText, k);
          if (spec) {
            results.push({ specifier: spec.value, type: 'dynamic-import' });
            i = spec.endIndex;
            continue;
          }
        }
      }

      // Pattern 2: import 'side-effect' or import "side-effect"
      if (sourceText[k] === '"' || sourceText[k] === "'") {
        const spec = readStringLiteral(sourceText, k);
        if (spec) {
          results.push({ specifier: spec.value, type: 'side-effect' });
          i = spec.endIndex;
          continue;
        }
      }

      // Pattern 3: static import ... from 'specifier'
      const lineEnd = findStatementEnd(sourceText, start);
      const segment = sourceText.slice(start, lineEnd);
      const fromMatch = segment.match(/\bfrom\s*['"]([^'"]+)['"]/);
      if (fromMatch && fromMatch[1]) {
        results.push({ specifier: fromMatch[1], type: 'static-import' });
        i = lineEnd;
        continue;
      }
    }

    // Check for "export" keyword
    if (sourceText.startsWith('export', i) && isWordBoundary(sourceText, i, 6)) {
      const start = i;
      i += 6;
      const lineEnd = findStatementEnd(sourceText, start);
      const segment = sourceText.slice(start, lineEnd);
      const fromMatch = segment.match(/\bfrom\s*['"]([^'"]+)['"]/);
      if (fromMatch && fromMatch[1]) {
        results.push({ specifier: fromMatch[1], type: 'export-from' });
        i = lineEnd;
        continue;
      }
    }

    // Check for "require(" keyword
    if (sourceText.startsWith('require', i) && isWordBoundary(sourceText, i, 7)) {
      i += 7;
      let k = i;
      while (k < len && (sourceText[k] === ' ' || sourceText[k] === '\t' || sourceText[k] === '\n' || sourceText[k] === '\r')) k += 1;
      if (sourceText[k] === '(') {
        k += 1;
        while (k < len && (sourceText[k] === ' ' || sourceText[k] === '\t' || sourceText[k] === '\n' || sourceText[k] === '\r')) k += 1;
        if (sourceText[k] === '"' || sourceText[k] === "'") {
          const spec = readStringLiteral(sourceText, k);
          if (spec) {
            results.push({ specifier: spec.value, type: 'require' });
            i = spec.endIndex;
            continue;
          }
        }
      }
    }

    i += 1;
  }

  return results;
}

function isWordBoundary(text: string, index: number, length: number): boolean {
  const prev = index > 0 ? text[index - 1] : ' ';
  const next = index + length < text.length ? text[index + length] : ' ';
  const isWordChar = (c: string) => /[a-zA-Z0-9_$]/.test(c);
  return !isWordChar(prev) && !isWordChar(next);
}

function readStringLiteral(text: string, startIndex: number): { value: string; endIndex: number } | null {
  const quote = text[startIndex];
  if (quote !== '"' && quote !== "'") return null;
  let val = '';
  let i = startIndex + 1;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\' && i + 1 < text.length) {
      val += text[i + 1];
      i += 2;
    } else {
      val += text[i];
      i += 1;
    }
  }
  return { value: val, endIndex: i + 1 };
}

function findStatementEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && text[i] !== ';' && text[i] !== '\n') {
    i += 1;
  }
  return Math.min(i + 1, text.length);
}

/**
 * Parses tsconfig.json or jsconfig.json content into compiler aliases.
 */
export function parseTsConfigAliases(jsonText: string): TsConfigAliases {
  try {
    // Strip simple JSON comments before parsing
    const clean = jsonText
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    const parsed = JSON.parse(clean);
    const compiler = parsed.compilerOptions || {};
    return {
      baseUrl: compiler.baseUrl,
      paths: compiler.paths,
    };
  } catch {
    return {};
  }
}

/**
 * Resolves an import specifier against project indexed file paths.
 */
export function resolveSpecifier(
  importerPath: string,
  specifier: string,
  allFilePaths: Set<string>,
  aliases?: TsConfigAliases
): { targetPath: string; isExternal: boolean; isResolved: boolean } {
  // 1. External packages: specifiers not starting with relative/root indicator and not matching local alias
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';
  const isAbsolute = specifier.startsWith('/');

  // Try alias matches first if configured
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

  // Common default Vite/Next alias: `@/*` -> `src/*` or `./*`
  if (specifier.startsWith('@/') && (!aliases?.paths || !aliases.paths['@/*'])) {
    const sub = specifier.slice(2);
    const candidateSrc = testCandidatePath(`src/${sub}`, allFilePaths);
    if (candidateSrc) return { targetPath: candidateSrc, isExternal: false, isResolved: true };
    const candidateRoot = testCandidatePath(sub, allFilePaths);
    if (candidateRoot) return { targetPath: candidateRoot, isExternal: false, isResolved: true };
  }

  // baseUrl resolution
  if (aliases?.baseUrl && !isRelative && !isAbsolute) {
    const baseCandidate = testCandidatePath(`${aliases.baseUrl}/${specifier}`, allFilePaths);
    if (baseCandidate) {
      return { targetPath: baseCandidate, isExternal: false, isResolved: true };
    }
  }

  // Relative resolution
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

  // If not relative and did not match any local alias, it's an external npm package
  return {
    targetPath: extractPackageName(specifier),
    isExternal: true,
    isResolved: true,
  };
}

/**
 * Tests a candidate path against the set of indexed project file paths,
 * trying common extension variants and index files.
 */
function testCandidatePath(candidate: string, allFilePaths: Set<string>, baseUrl?: string): string | null {
  const norm = normalizeRelativePath(baseUrl && baseUrl !== '.' ? `${baseUrl}/${candidate}` : candidate);

  // Exact match
  if (allFilePaths.has(norm)) return norm;

  // If candidate ends with .js or .jsx, also try TypeScript substitutions
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

  // Index candidates
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
 * Builds the complete DependencyGraphData for all analyzed project files.
 */
export function buildDependencyGraph(
  analyzedFiles: Array<{ id: string; path: string; text?: string; cachedEdges?: DependencyEdge[] }>,
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
    // If cached edges already exist from previous scan and source was unchanged, reuse them!
    if (file.cachedEdges && file.cachedEdges.length > 0) {
      for (const edge of file.cachedEdges) {
        // Re-link targetId in case target node IDs changed or new files were added
        const targetId = edge.targetPath ? pathToId.get(edge.targetPath) : undefined;
        allEdges.push({ ...edge, targetId });
        if (edge.isExternal) externalPackagesSet.add(edge.targetPath);
      }
      continue;
    }

    if (!file.text) continue;

    const rawSpecifiers = extractSpecifiers(file.text);
    for (let idx = 0; idx < rawSpecifiers.length; idx += 1) {
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
 * Finds all simple circular dependency cycles using DFS cycle detection.
 * Returns unique cycles formatted as arrays of file paths.
 */
export function findCircularDependencies(edges: DependencyEdge[]): string[][] {
  const adj = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!edge.isExternal && edge.isResolved && edge.targetPath && edge.sourcePath !== edge.targetPath) {
      if (!adj.has(edge.sourcePath)) adj.set(edge.sourcePath, new Set());
      adj.get(edge.sourcePath)!.add(edge.targetPath);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const currentPath: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    recStack.add(node);
    currentPath.push(node);

    const neighbors = adj.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Cycle detected! Extract from neighbor to current
          const cycleStart = currentPath.indexOf(neighbor);
          if (cycleStart !== -1) {
            const cycle = [...currentPath.slice(cycleStart), neighbor];
            // Normalize cycle representation (start with smallest path string)
            const minPath = [...cycle.slice(0, -1)].sort()[0];
            const minIdx = cycle.indexOf(minPath);
            const normalized = [...cycle.slice(minIdx, -1), ...cycle.slice(0, minIdx), minPath];
            // Check if cycle is already recorded
            const key = normalized.join(' -> ');
            if (!cycles.some((c) => c.join(' -> ') === key)) {
              cycles.push(normalized);
            }
          }
        }
      }
    }

    recStack.delete(node);
    currentPath.pop();
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles.sort((a, b) => a.length - b.length || a[0].localeCompare(b[0]));
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
