import type { AnalysisCategory } from '../domain/models';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less', html: 'HTML', htm: 'HTML',
  json: 'JSON', md: 'Markdown', mdx: 'MDX', py: 'Python', java: 'Java', kt: 'Kotlin',
  kts: 'Kotlin', go: 'Go', rs: 'Rust', c: 'C', h: 'C/C++ Header', cpp: 'C++', cc: 'C++',
  cs: 'C#', php: 'PHP', rb: 'Ruby', swift: 'Swift', sql: 'SQL', xml: 'XML',
  yml: 'YAML', yaml: 'YAML', toml: 'TOML', sh: 'Shell', bash: 'Shell', ps1: 'PowerShell',
  dart: 'Dart', vue: 'Vue', svelte: 'Svelte', ini: 'INI', properties: 'Properties', env: 'Environment',
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  license: 'Text',
  'license.md': 'Markdown',
  '.gitignore': 'Git Ignore',
  '.npmrc': 'NPM Config',
  '.editorconfig': 'EditorConfig',
};

const CONFIG_EXTENSIONS = new Set(['json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'properties']);
const DOC_EXTENSIONS = new Set(['md', 'mdx']);
const SENSITIVE_FILE_NAMES = new Set(['.env', '.env.local', '.env.development', '.env.production', '.npmrc']);
const SENSITIVE_EXTENSIONS = new Set(['pem', 'key', 'p12', 'pfx', 'jks', 'keystore']);

export const TEXT_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXTENSION));

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

export function languageFor(name: string): string | undefined {
  return LANGUAGE_BY_FILENAME[name.toLowerCase()] ?? LANGUAGE_BY_EXTENSION[extensionOf(name)];
}

export function isAnalyzableText(name: string): boolean {
  return Boolean(LANGUAGE_BY_FILENAME[name.toLowerCase()]) || TEXT_EXTENSIONS.has(extensionOf(name));
}

export function isSensitiveTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_FILE_NAMES.has(lower) || lower.startsWith('.env.') || SENSITIVE_EXTENSIONS.has(extensionOf(name));
}

export function analysisCategoryFor(path: string, name: string): AnalysisCategory {
  const lowerPath = path.toLowerCase();
  const extension = extensionOf(name);
  const lowerName = name.toLowerCase();
  if (/(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/.test(lowerPath) || /\.(test|spec)\.[^.]+$/.test(lowerName)) return 'test';
  if (DOC_EXTENSIONS.has(extension) || lowerName === 'license') return 'documentation';
  if (CONFIG_EXTENSIONS.has(extension) || ['dockerfile', 'makefile', '.gitignore', '.editorconfig', '.npmrc'].includes(lowerName)) return 'configuration';
  return 'source';
}

export function compactBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
