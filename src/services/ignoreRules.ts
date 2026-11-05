export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.gradle', 'build', 'dist', 'out', '.next', '.nuxt', '.svelte-kit',
  '.cache', 'coverage', '.turbo', '.parcel-cache', 'target', 'vendor',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.venv', 'venv',
  'Pods', 'DerivedData', '.dart_tool', '.expo', '.angular', '.nx',
]);

export const DEFAULT_IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db',
]);

/**
 * Normalizes custom exclusion paths:
 * - Normalizes slashes (converts backslashes to forward slashes)
 * - Trims whitespace
 * - Strips leading ./
 * - Collapses duplicate separators (// -> /)
 * - Strips leading and trailing slashes
 * - Rejects directory traversal (../, .., .)
 */
export function normalizeExclusionPath(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let p = raw.replace(/\\/g, '/').trim();
  p = p.replace(/^\.\//, '');
  p = p.replace(/\/+/g, '/');
  p = p.replace(/^\/+|\/+$/g, '');
  // Reject traversal outside project root
  if (p === '..' || p.startsWith('../') || p.includes('/../') || p.endsWith('/..') || p === '.') {
    return null;
  }
  return p || null;
}

export function shouldIgnoreEntry(
  name: string,
  kind: 'file' | 'directory',
  pathOrExclusions?: string | Iterable<string>,
  customExclusionsParam?: Iterable<string>
): boolean {
  if (kind === 'directory' ? DEFAULT_IGNORED_DIRECTORIES.has(name) : DEFAULT_IGNORED_FILES.has(name)) {
    return true;
  }

  let currentPath = name;
  let exclusions: Iterable<string> | undefined;

  if (typeof pathOrExclusions === 'string') {
    currentPath = pathOrExclusions.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || name;
    exclusions = customExclusionsParam;
  } else if (pathOrExclusions && typeof (pathOrExclusions as Iterable<string>)[Symbol.iterator] === 'function') {
    exclusions = pathOrExclusions as Iterable<string>;
  }

  if (!exclusions) return false;

  for (const raw of exclusions) {
    const normalized = normalizeExclusionPath(raw);
    if (!normalized) continue;

    if (name === normalized || currentPath === normalized || currentPath.startsWith(normalized + '/')) {
      return true;
    }
  }

  return false;
}

