/**
 * File Classifier & Language Registry for NEXUS
 * Pure functions for file type resolution and visual metrics.
 */

export interface LanguageMeta {
  name: string;
  color: string; // Vibrant obsidian-complementary color
  isCode: boolean;
}

const EXTENSION_MAP: Record<string, LanguageMeta> = {
  // TypeScript & JavaScript
  ts: { name: 'TypeScript', color: '#3178C6', isCode: true },
  tsx: { name: 'TypeScript React', color: '#2b7489', isCode: true },
  js: { name: 'JavaScript', color: '#F7DF1E', isCode: true },
  jsx: { name: 'JavaScript React', color: '#E5A00D', isCode: true },
  mjs: { name: 'JavaScript', color: '#F7DF1E', isCode: true },
  cjs: { name: 'JavaScript', color: '#F7DF1E', isCode: true },

  // Systems & Backend
  py: { name: 'Python', color: '#3572A5', isCode: true },
  rs: { name: 'Rust', color: '#DEA584', isCode: true },
  go: { name: 'Go', color: '#00ADD8', isCode: true },
  java: { name: 'Java', color: '#B07219', isCode: true },
  c: { name: 'C', color: '#555555', isCode: true },
  cpp: { name: 'C++', color: '#F34B7D', isCode: true },
  cs: { name: 'C#', color: '#178600', isCode: true },
  rb: { name: 'Ruby', color: '#701516', isCode: true },
  php: { name: 'PHP', color: '#4F5D95', isCode: true },
  swift: { name: 'Swift', color: '#F05138', isCode: true },
  kt: { name: 'Kotlin', color: '#A97BFF', isCode: true },

  // Web & Styles
  html: { name: 'HTML', color: '#E34C26', isCode: true },
  css: { name: 'CSS', color: '#563D7C', isCode: true },
  scss: { name: 'SCSS', color: '#C6538C', isCode: true },
  less: { name: 'Less', color: '#1D365D', isCode: true },
  svg: { name: 'SVG', color: '#FF9900', isCode: false },

  // Data & Config
  json: { name: 'JSON', color: '#CB171E', isCode: false },
  yaml: { name: 'YAML', color: '#CB171E', isCode: false },
  yml: { name: 'YAML', color: '#CB171E', isCode: false },
  toml: { name: 'TOML', color: '#9C4221', isCode: false },
  xml: { name: 'XML', color: '#0060AC', isCode: false },
  sql: { name: 'SQL', color: '#E38C00', isCode: true },
  sh: { name: 'Shell', color: '#89E051', isCode: true },
  bash: { name: 'Shell', color: '#89E051', isCode: true },
  zsh: { name: 'Shell', color: '#89E051', isCode: true },

  // Documentation
  md: { name: 'Markdown', color: '#083FA1', isCode: false },
  mdx: { name: 'MDX', color: '#FCB32C', isCode: true },
  txt: { name: 'Plain Text', color: '#8B949E', isCode: false },
};

/**
 * Extracts normalized file extension from a filename or relative path.
 * Examples:
 * - "App.tsx" -> "tsx"
 * - ".gitignore" -> "gitignore"
 * - "archive.tar.gz" -> "gz"
 * - "Makefile" -> ""
 */
export function extractExtension(filename: string): string {
  const base = filename.split('/').pop() || '';
  if (!base) return '';

  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return base.slice(1).toLowerCase();
  }

  const parts = base.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()!.toLowerCase();
}

/**
 * Resolves language display name and color for a filename.
 */
export function classifyFile(filename: string): { language: string; color: string; isCode: boolean; extension: string } {
  const ext = extractExtension(filename);
  const match = EXTENSION_MAP[ext];

  if (match) {
    return {
      language: match.name,
      color: match.color,
      isCode: match.isCode,
      extension: ext,
    };
  }

  // Common special filenames without standard extensions
  const base = (filename.split('/').pop() || '').toLowerCase();
  if (base === 'dockerfile') {
    return { language: 'Docker', color: '#384D54', isCode: true, extension: 'dockerfile' };
  }
  if (base === 'makefile') {
    return { language: 'Makefile', color: '#427819', isCode: true, extension: 'mk' };
  }
  if (base === 'license' || base.startsWith('license.')) {
    return { language: 'License', color: '#6E7681', isCode: false, extension: 'license' };
  }

  return {
    language: ext ? ext.toUpperCase() : 'Other',
    color: '#8B5CF6', // Purple obsidian default
    isCode: false,
    extension: ext || 'none',
  };
}

/**
 * Formats a raw byte count into human-friendly strings (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} B`;
  const idx = Math.min(i, sizes.length - 1);
  const val = (bytes / Math.pow(k, idx)).toFixed(idx === 0 ? 0 : 1);
  return `${val} ${sizes[idx]}`;
}
