import { test } from 'node:test';
import assert from 'node:assert/strict';

import { START, END, wrap, hasBlock, upsert, extractBody } from '../src/managed.js';

const BODY = '## Rules\n\nBe precise.';

test('wrap produces a detectable managed block', () => {
  const out = wrap(BODY);
  assert.ok(out.startsWith(START));
  assert.ok(out.trimEnd().endsWith(END));
  assert.ok(hasBlock(out));
  assert.equal(extractBody(out).endsWith('Be precise.'), true);
});

test('a missing file becomes a bare managed block', () => {
  assert.equal(upsert(null, BODY), wrap(BODY));
  assert.equal(upsert('', BODY), wrap(BODY));
});

test('hand-written content is preserved when the block is appended', () => {
  const existing = '# My Project\n\nNotes I wrote by hand.\n';
  const out = upsert(existing, BODY);
  assert.ok(out.startsWith(existing), 'existing content must survive verbatim');
  assert.ok(hasBlock(out));
});

test('re-running replaces only the managed region', () => {
  const existing = '# Header I keep\n';
  const first = upsert(existing, BODY);
  const second = upsert(first, '## Rules\n\nBe concise.');
  assert.ok(second.startsWith('# Header I keep'), 'content above the block must survive');
  assert.match(second, /Be concise\./);
  assert.doesNotMatch(second, /Be precise\./, 'stale managed content must be gone');
});

test('content after the block survives a rewrite', () => {
  const existing = `# Top\n\n${wrap(BODY)}\n## My own footer\n\nkeep me\n`;
  const out = upsert(existing, '## Rules\n\nNew body.');
  assert.ok(out.includes('# Top'));
  assert.ok(out.includes('## My own footer'));
  assert.ok(out.includes('keep me'));
  assert.match(out, /New body\./);
});

test('upsert is idempotent', () => {
  const once = upsert('# Title\n', BODY);
  assert.equal(upsert(once, BODY), once, 'syncing twice must not change the file');
});

test('extractBody returns null when there is no block', () => {
  assert.equal(extractBody('just a file\n'), null);
  assert.equal(hasBlock('just a file\n'), false);
});
