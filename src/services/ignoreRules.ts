export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.gradle', 'build', 'dist', 'out', '.next', '.nuxt', '.svelte-kit',
  '.cache', 'coverage', '.turbo', '.parcel-cache', 'target', 'vendor',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.venv', 'venv',
  'Pods', 'DerivedData', '.dart_tool', '.expo', '.angular', '.nx',
]);

export const DEFAULT_IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db',
]);

export function shouldIgnoreEntry(name: string, kind: 'file' | 'directory'): boolean {
  return kind === 'directory' ? DEFAULT_IGNORED_DIRECTORIES.has(name) : DEFAULT_IGNORED_FILES.has(name);
}
