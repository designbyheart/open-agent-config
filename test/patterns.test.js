import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { PATTERNS_REL } from '../src/patterns.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'bin', 'cli.js');

function oac(dir, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
}

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-patterns-'));
  const dir = path.join(root, 'demo-project');
  fs.mkdirSync(dir);
  return dir;
}

const INIT = ['init', '--yes', '--targets=claude,codex'];
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

test('init scaffolds the patterns file and inlines it into every target', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);

  assert.ok(fs.existsSync(path.join(dir, PATTERNS_REL)), `expected ${PATTERNS_REL}`);
  const scaffold = read(dir, PATTERNS_REL);
  assert.match(scaffold, /load-bearing/, 'template ships the default banned phrases');
  assert.match(scaffold, /D1, D2/, 'template ships the default reference-point codes');

  // The content must reach the tools, not just sit in a file they cannot open.
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    assert.match(read(dir, f), /## Communication Patterns/, `${f} inlines the patterns section`);
    assert.match(read(dir, f), /load-bearing/, `${f} carries the banned phrases`);
    assert.doesNotMatch(read(dir, f), /THIS FILE IS YOURS/, `${f} must not carry the human-only notes`);
    assert.doesNotMatch(read(dir, f), /oac scaffolds it once/, `${f} must not carry the template's comment block`);
  }
});

test('a tuned patterns file is never overwritten and its edits reach the configs', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);

  const tuned = '---\ntitle: Communication Patterns\n---\n\n# Communication Patterns\n\nNever say `synergy`.\n';
  fs.writeFileSync(path.join(dir, PATTERNS_REL), tuned);

  assert.equal(oac(dir, ['sync']).status, 0);
  assert.equal(read(dir, PATTERNS_REL), tuned, 'sync must not overwrite the tuned file');
  assert.match(read(dir, 'CLAUDE.md'), /Never say `synergy`/);
  assert.doesNotMatch(read(dir, 'CLAUDE.md'), /load-bearing/, 'stale template content must be gone');
});

test('--no-patterns skips the scaffold entirely', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, [...INIT, '--no-patterns']).status, 0);

  assert.ok(!fs.existsSync(path.join(dir, PATTERNS_REL)), 'nothing should be scaffolded');
  assert.doesNotMatch(read(dir, 'CLAUDE.md'), /## Communication Patterns/);
  assert.equal(oac(dir, ['doctor']).status, 0, 'opting out must still be a healthy project');
});

test('doctor reports drift after the patterns file is edited, and sync clears it', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);
  assert.equal(oac(dir, ['doctor']).status, 0);

  fs.appendFileSync(path.join(dir, PATTERNS_REL), '\n- Never use the word `robust`.\n');

  const drifted = oac(dir, ['doctor']);
  assert.notEqual(drifted.status, 0, 'an edited patterns file makes the generated configs stale');
  assert.match(drifted.stdout, /communication-patterns\.md changed/);

  assert.equal(oac(dir, ['sync']).status, 0);
  assert.equal(oac(dir, ['doctor']).status, 0, 'sync must clear the drift');
  assert.match(read(dir, 'CLAUDE.md'), /Never use the word `robust`/);
});

test('keys prints aliases, reference codes and skills from the project file', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, [...INIT, '--skills=code-review']).status, 0);

  const r = oac(dir, ['keys']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /source: \.oac\/communication-patterns\.md/);
  assert.match(r.stdout, /scr\s+Simplify, compress/, 'alias table');
  assert.match(r.stdout, /R1, R2, …\s+Risks/, 'reference-code table');
  assert.match(r.stdout, /\/code-review/, 'installed skills are listed');
});

test('keys reflects a hand-added alias after sync', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);

  const file = path.join(dir, PATTERNS_REL);
  fs.writeFileSync(
    file,
    fs.readFileSync(file, 'utf8').replace('| `stop` |', '| `qa` | Build, test, lint. Failures only. |\n| `stop` |')
  );

  assert.match(oac(dir, ['keys']).stdout, /qa\s+Build, test, lint/, 'reads the file directly, no sync needed');
});

test('keys falls back to catalog defaults with no project or scaffold', () => {
  const dir = tmpProject();
  const r = oac(dir, ['keys']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /source: catalog default/);
  assert.match(r.stdout, /scr\s+Simplify/, 'defaults still explain themselves');
});

test('init writes the /keys slash command for Claude', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, INIT).status, 0);
  const cmd = read(dir, path.join('.claude', 'commands', 'keys.md'));
  assert.match(cmd, /^---\ndescription: /, 'needs frontmatter to register as a command');
  assert.match(cmd, /oac keys/);
});

test('skills-only mode leaves the project free of a scaffold', () => {
  const dir = tmpProject();
  assert.equal(oac(dir, ['init', '--yes', '--skills-only', '--skills=code-review']).status, 0);
  assert.ok(!fs.existsSync(path.join(dir, PATTERNS_REL)), 'skills-only must not write project rule material');
});
