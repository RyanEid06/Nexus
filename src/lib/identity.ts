/**
 * Deterministic Identity & Path Normalization Engine for NEXUS
 * Ensures stable node identities across sessions and platforms.
 */

/**
 * Normalizes any file or folder path to a canonical POSIX format.
 * - Replaces backslashes with forward slashes
 * - Strips leading and trailing slashes
 * - Collapses redundant consecutive slashes
 */
export function normalizePath(path: string): string {
  if (!path) return '';
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Simple 32-bit FNV-1a deterministic string hashing function.
 * Fast, pure, and uniform across browser and node runtimes without external crypto dependencies.
 */
export function hashString(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generates a stable, human-readable Project ID.
 */
export function createProjectId(name: string, pathHint?: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const hash = hashString(`${name}::${pathHint || ''}`);
  return `proj_${sanitized || 'repo'}_${hash}`;
}

/**
 * Generates a persistent, canonical Node ID.
 * Example: `proj_myapp_a1b2c3d4::src/lib/identity.ts`
 */
export function createNodeId(projectId: string, relativePath: string): string {
  const normalized = normalizePath(relativePath);
  return `${projectId}::${normalized}`;
}
