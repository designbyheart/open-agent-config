import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { MANIFEST_NAME } from '../src/manifest.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'bin', 'cli.js');

function oac(dir, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
}

function tmpProject(name = 'demo-project') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-e2e-'));
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  return dir;
}

const INIT = ['init', '--yes', '--targets=claude,cursor,codex', '--stacks=nextjs', '--skills=code-review'];

test('init writes the manifest and one config per selected target', () => {
  const dir = tmpProject();
  const r = oac(dir, INIT);
  assert.equal(r.status, 0, r.stderr);
  for (const f of [MANIFEST_NAME, 'CLAUDE.md', 'AGENTS.md', path.join('.cursor', 'rules', 'oac.mdc')]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `expected ${f}`);
  }
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'code-review', 'SKILL.md')));
});

test('sync is idempotent — running it twice changes nothing', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);
  assert.equal(oac(dir, ['sync']).status, 0);
  const after1 = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.equal(oac(dir, ['sync']).status, 0);
  const after2 = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.equal(after1, after2, 'a second sync must be a no-op');
});

test('sync preserves hand edits made outside the managed block', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);
  const file = path.join(dir, 'CLAUDE.md');
  fs.writeFileSync(file, '# Team notes\n\nDo not delete me.\n\n' + fs.readFileSync(file, 'utf8'));
  assert.equal(oac(dir, ['sync']).status, 0);
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /Do not delete me\./);
});

test('doctor passes on a fresh init and fails when a config file goes missing', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);
  assert.equal(oac(dir, ['doctor']).status, 0);

  fs.rmSync(path.join(dir, 'AGENTS.md'));
  const broken = oac(dir, ['doctor']);
  assert.notEqual(broken.status, 0, 'doctor must fail when a generated file is gone');
  assert.match(broken.stdout, /Missing file/);
});

test('doctor flags a destroyed managed block', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'someone pasted over this file\n');
  const r = oac(dir, ['doctor']);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /Managed block missing/);
});

test('doctor refuses to run in an unconfigured directory', () => {
  const r = oac(tmpProject(), ['doctor']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /oac init/);
});

test('skills-only never touches an existing agent config', () => {
  const dir = tmpProject();
  const existing = '# AGENTS\n\nOur own rules, hand maintained.\n';
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), existing);

  const r = oac(dir, ['init', '--yes', '--skills-only', '--skills=code-review']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), existing);
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'code-review', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, MANIFEST_NAME)));
});

test('an unknown skill id is rejected instead of silently ignored', () => {
  const dir = tmpProject();
  const r = oac(dir, ['init', '--yes', '--targets=claude', '--skills=definitely-not-a-skill']);
  assert.notEqual(r.status, 0, 'unknown skill must not pass silently');
});

test('list and --help work without a project', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, ['list', 'targets']).status, 0);
  assert.equal(oac(dir, ['--help']).status, 0);
});
