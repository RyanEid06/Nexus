/**
 * Local-First Recent Projects Vault for NEXUS
 * Pure client-side metadata persistence in browser localStorage.
 * No file contents or external network sync.
 */

import { RecentProjectMetadata } from '../types/nexus';

const STORAGE_KEY = 'nexus_recent_projects_v1';
const MAX_RECENT_PROJECTS = 10;

export function getRecentProjects(): RecentProjectMetadata[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveRecentProject(meta: RecentProjectMetadata): void {
  try {
    const current = getRecentProjects();
    const filtered = current.filter(p => p.id !== meta.id && p.name !== meta.name);
    const updated = [meta, ...filtered].slice(0, MAX_RECENT_PROJECTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Graceful fallback if localStorage is disabled or restricted in sandboxed iframe
  }
}

export function removeRecentProject(projectId: string): void {
  try {
    const current = getRecentProjects();
    const updated = current.filter(p => p.id !== projectId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore error
  }
}

export function clearRecentProjects(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore error
  }
}
