import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { installMode, updateFromGit, gitSpec, globalBinOwner, clearBinConflict } from '../src/commands/update.js';

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
  // Windows runners default to core.autocrlf=true, which would rewrite the
  // fixture's line endings and break byte-exact content assertions.
  git(seed, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(seed, 'file.txt'), 'one\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'first');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-q', '-u', 'origin', 'main');

  spawnSync('git', ['clone', '-q', '--config', 'core.autocrlf=false', remote, clone]);
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

/**
 * A throwaway npm prefix laid out the way a global install is: the shim in
 * <prefix>/bin symlinked at a package's entry point under lib/node_modules.
 */
function globalPrefix(pkgName, version = '0.1.2', bin = 'oac') {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-prefix-'));
  const pkgDir = path.join(prefix, 'lib', 'node_modules', ...pkgName.split('/'));
  fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(prefix, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: pkgName, version }));
  fs.writeFileSync(path.join(pkgDir, 'bin', 'cli.js'), '#!/usr/bin/env node\n');
  fs.symlinkSync(path.join(pkgDir, 'bin', 'cli.js'), path.join(prefix, 'bin', bin));
  return prefix;
}

test('globalBinOwner names the package holding the oac bin', () => {
  const owner = globalBinOwner('oac', globalPrefix('open-agent-config'));
  assert.equal(owner?.name, 'open-agent-config');
  assert.equal(owner?.version, '0.1.2');
});

test('globalBinOwner reads through a scoped package directory', () => {
  const owner = globalBinOwner('oac', globalPrefix('@designbyheart/open-agent-config', '0.1.6'));
  assert.equal(owner?.name, '@designbyheart/open-agent-config');
});

test('globalBinOwner claims nothing when no package owns the bin', () => {
  assert.equal(globalBinOwner('oac', globalPrefix('open-agent-config', '0.1.2', 'other-bin')), null);
  assert.equal(globalBinOwner('oac', fs.mkdtempSync(path.join(os.tmpdir(), 'oac-empty-'))), null);
  assert.equal(globalBinOwner('oac', null), null);
});

test('globalBinOwner ignores a shim that is not an npm install', () => {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-handrolled-'));
  fs.mkdirSync(path.join(prefix, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(prefix, 'bin', 'oac'), '#!/bin/sh\n');
  assert.equal(globalBinOwner('oac', prefix), null, "a hand-written script is not ours to uninstall");
});

test('a predecessor owning the bin is reported under --check, not removed', () => {
  const owner = { name: 'open-agent-config', version: '0.1.2', dir: '/tmp/x' };
  const { out } = capture(() =>
    assert.equal(clearBinConflict('@designbyheart/open-agent-config', { check: true, owner }), true)
  );
  assert.match(out, /open-agent-config@0\.1\.2/);
  assert.match(out, /Run "oac update"/);
});

test('an install of the same package is left to npm rather than uninstalled', () => {
  const name = '@designbyheart/open-agent-config';
  const owner = { name, version: '0.1.5', dir: '/tmp/x' };
  // No npm call and no output: uninstalling here would delete the copy being upgraded.
  const { out } = capture(() => assert.equal(clearBinConflict(name, { owner }), false));
  assert.equal(out, '');
  assert.equal(clearBinConflict(name, { owner: null }), false, 'nothing installed is not a conflict');
});
