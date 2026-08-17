import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { installMode, updateFromGit, gitSpec } from '../src/commands/update.js';

const run = (cwd, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};
const git = (cwd, ...args) => run(cwd, 'git', args);

/** A bare "remote" with one commit, plus a clone tracking it. */
function repoPair() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-update-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const clone = path.join(root, 'clone');

  spawnSync('git', ['init', '--bare', '-b', 'main', remote]);
  spawnSync('git', ['init', '-b', 'main', seed]);
  git(seed, 'config', 'user.email', 't@example.com');
  git(seed, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(seed, 'file.txt'), 'one\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'first');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-q', '-u', 'origin', 'main');

  spawnSync('git', ['clone', '-q', remote, clone]);
  return { seed, clone };
}

/** Add a commit to the shared remote so the clone falls behind. */
function pushUpstream({ seed }, text) {
  fs.appendFileSync(path.join(seed, 'file.txt'), text);
  git(seed, 'commit', '-am', 'upstream change');
  git(seed, 'push', '-q');
}

/** Run a function with console.log captured. Restores exitCode too. */
function capture(fn) {
  const lines = [];
  const real = console.log;
  const exitCode = process.exitCode;
  console.log = (...a) => lines.push(a.join(' '));
  try {
    fn();
  } finally {
    console.log = real;
  }
  const code = process.exitCode;
  process.exitCode = exitCode;
  return { out: lines.join('\n'), code };
}

test('installMode reads a git checkout as source and anything else as global', () => {
  const { clone } = repoPair();
  assert.equal(installMode(clone), 'source');
  assert.equal(installMode(fs.mkdtempSync(path.join(os.tmpdir(), 'oac-plain-'))), 'global');
});

test('gitSpec turns a repository URL into an npm-installable spec', () => {
  const expected = 'github:designbyheart/open-agent-config';
  for (const url of [
    'git+https://github.com/designbyheart/open-agent-config.git',
    'https://github.com/designbyheart/open-agent-config',
    'git@github.com:designbyheart/open-agent-config.git',
  ]) {
    assert.equal(gitSpec(url), expected, url);
  }
  assert.equal(gitSpec('https://gitlab.com/x/y.git'), null, 'non-GitHub hosts are not guessed at');
  assert.equal(gitSpec(undefined), null);
});

test('the real package manifest yields a usable install spec for colleagues', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const meta = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
  assert.ok(gitSpec(meta.repository?.url), 'colleagues on a global install must have somewhere to update from');
});

test('update reports up to date when the clone matches its upstream', () => {
  const { clone } = repoPair();
  const { out } = capture(() => updateFromGit(clone, { check: true }));
  assert.match(out, /Already up to date/);
});

test('--check lists pending commits without moving HEAD', () => {
  const pair = repoPair();
  const before = git(pair.clone, 'rev-parse', 'HEAD');
  pushUpstream(pair, 'two\n');

  const { out } = capture(() => updateFromGit(pair.clone, { check: true }));
  assert.match(out, /1 new commit/);
  assert.match(out, /upstream change/);
  assert.match(out, /Run "oac update" to pull/);
  assert.equal(git(pair.clone, 'rev-parse', 'HEAD'), before, '--check must not pull');
});

test('a dirty working tree is refused instead of pulled into', () => {
  const pair = repoPair();
  pushUpstream(pair, 'two\n');
  fs.writeFileSync(path.join(pair.clone, 'uncommitted.txt'), 'work in progress\n');
  const before = git(pair.clone, 'rev-parse', 'HEAD');

  const { out, code } = capture(() => updateFromGit(pair.clone, {}));
  assert.match(out, /Working tree is not clean/);
  assert.match(out, /uncommitted\.txt/, 'must name what is blocking the pull');
  assert.equal(code, 1, 'refusing to update is a failure exit');
  assert.equal(git(pair.clone, 'rev-parse', 'HEAD'), before, 'HEAD must not move');
  assert.ok(fs.existsSync(path.join(pair.clone, 'uncommitted.txt')), 'local work survives');
});

test('a clean clone fast-forwards and reports the new commits', () => {
  const pair = repoPair();
  pushUpstream(pair, 'two\n');
  const before = git(pair.clone, 'rev-parse', 'HEAD');

  const { out } = capture(() => updateFromGit(pair.clone, {}));
  assert.match(out, /1 new commit/);
  assert.notEqual(git(pair.clone, 'rev-parse', 'HEAD'), before, 'HEAD must advance');
  assert.equal(fs.readFileSync(path.join(pair.clone, 'file.txt'), 'utf8'), 'one\ntwo\n');
});

test('a branch with no upstream says so instead of failing obscurely', () => {
  const { clone } = repoPair();
  git(clone, 'checkout', '-q', '-b', 'detached-work');

  const { out } = capture(() => updateFromGit(clone, { check: true }));
  assert.match(out, /no upstream/);
  assert.match(out, /--set-upstream-to/);
});
