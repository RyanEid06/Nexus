import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExtension, classifyFile, formatBytes } from './fileClassifier';

test('extractExtension: handles standard, dotfiles, multi-dot, and extensionless files', () => {
  assert.equal(extractExtension('App.tsx'), 'tsx');
  assert.equal(extractExtension('src/lib/tree.ts'), 'ts');
  assert.equal(extractExtension('.gitignore'), 'gitignore');
  assert.equal(extractExtension('archive.tar.gz'), 'gz');
  assert.equal(extractExtension('Makefile'), '');
  assert.equal(extractExtension('Dockerfile'), '');
});

test('classifyFile: resolves language, code status, and accent color', () => {
  const ts = classifyFile('main.ts');
  assert.equal(ts.language, 'TypeScript');
  assert.equal(ts.isCode, true);
  assert.equal(ts.extension, 'ts');

  const py = classifyFile('script.py');
  assert.equal(py.language, 'Python');
  assert.equal(py.isCode, true);

  const json = classifyFile('package.json');
  assert.equal(json.language, 'JSON');
  assert.equal(json.isCode, false);

  const docker = classifyFile('Dockerfile');
  assert.equal(docker.language, 'Docker');
});

test('formatBytes: formats accurately across scales', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024 * 1.2), '1.2 GB');
});
