import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, hashString, createProjectId, createNodeId } from './identity';

test('normalizePath: handles windows slashes, multiple slashes, and leading/trailing slashes', () => {
  assert.equal(normalizePath('src\\components\\Header.tsx'), 'src/components/Header.tsx');
  assert.equal(normalizePath('/src//components///Header.tsx/'), 'src/components/Header.tsx');
  assert.equal(normalizePath(''), '');
  assert.equal(normalizePath('file.ts'), 'file.ts');
  assert.equal(normalizePath('a/b/c'), 'a/b/c');
});

test('hashString: returns deterministic 8-char hex string', () => {
  const hash1 = hashString('my-project::/path');
  const hash2 = hashString('my-project::/path');
  const hash3 = hashString('different-project');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 8);
});

test('createProjectId: produces stable sanitized identifier', () => {
  const id1 = createProjectId('My Super Project!!', '/Users/dev/my-project');
  const id2 = createProjectId('My Super Project!!', '/Users/dev/my-project');
  const id3 = createProjectId('Another-Project');

  assert.equal(id1, id2);
  assert.match(id1, /^proj_my-super-project_[a-f0-9]{8}$/);
  assert.notEqual(id1, id3);
});

test('createNodeId: generates canonical persistent node ID', () => {
  const projectId = 'proj_test_12345678';
  const nodeId = createNodeId(projectId, 'src\\lib\\tree.ts');

  assert.equal(nodeId, 'proj_test_12345678::src/lib/tree.ts');
});
