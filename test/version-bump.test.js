import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { requiredVersion, parseSemver, compare, fmt } from '../hooks/version-bump.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(REPO, 'hooks', 'version-bump.mjs');

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const writeVersion = (dir, v) =>
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: v }, null, 2) + '\n');
const versionOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

/** A bare remote holding `main` at the given version, plus a clone of it. */
function repoWithRemote(mainVersion = '0.1.0') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-ver-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const clone = path.join(root, 'clone');

  spawnSync('git', ['init', '--bare', '-b', 'main', remote]);
  spawnSync('git', ['init', '-b', 'main', seed]);
  git(seed, 'config', 'user.email', 't@example.com');
  git(seed, 'config', 'user.name', 'Test');
  writeVersion(seed, mainVersion);
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'seed');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-q', '-u', 'origin', 'main');

  spawnSync('git', ['clone', '-q', remote, clone]);
  git(clone, 'config', 'user.email', 't@example.com');
  git(clone, 'config', 'user.name', 'Test');
  return { clone, seed };
}

/** Commit a real change, so there is something worth releasing. */
function commitWork(dir, name = 'feature.txt') {
  fs.writeFileSync(path.join(dir, name), `work ${name}\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', `add ${name}`);
}

/** Run the hook the way git does: refs on stdin. */
function runHook(dir, { stdin = 'refs/heads/main abc123 refs/heads/main def456\n', env = {} } = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: dir,
    input: stdin,
    encoding: 'utf8',
    // Cleared explicitly: an exported SKIP_VERSION_BUMP would make assertions
    // pass for the wrong reason.
    env: { ...process.env, SKIP_VERSION_BUMP: '', ...env },
  });
}

test('requiredVersion: same major.minor takes the remote patch plus one', () => {
  assert.deepEqual(requiredVersion([1, 0, 1], [1, 0, 1]), [1, 0, 2]);
  assert.deepEqual(requiredVersion([1, 0, 1], [1, 0, 9]), [1, 0, 2], 'a hand-set patch is ignored');
  assert.deepEqual(requiredVersion([1, 0, 10], [1, 0, 10]), [1, 0, 11], 'double-digit patches keep counting');
});

test('requiredVersion: a deliberate minor or major bump is kept', () => {
  assert.deepEqual(requiredVersion([1, 0, 7], [1, 1, 0]), [1, 1, 0]);
  assert.deepEqual(requiredVersion([1, 0, 7], [2, 0, 0]), [2, 0, 0]);
});

test('requiredVersion: going backwards is refused', () => {
  assert.equal(requiredVersion([1, 2, 0], [1, 1, 5]), null);
  assert.equal(requiredVersion([2, 0, 0], [1, 9, 9]), null);
});

test('parseSemver rejects anything that is not x.y.z', () => {
  assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
  for (const bad of ['1.2', 'v1.2.3', '1.2.3-beta', '', null, undefined]) {
    assert.equal(parseSemver(bad), null, String(bad));
  }
  assert.equal(compare([1, 0, 2], [1, 0, 10]), -1, 'patches compare numerically, not as strings');
  assert.equal(fmt([1, 0, 2]), '1.0.2');
});

test('a matching version is bumped, committed, and the push is stopped', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);
  const r = runHook(clone);

  assert.equal(r.status, 1, 'the push must be stopped so the commit can join the next one');
  assert.match(r.stderr, /0\.1\.0 → 0\.1\.1, committed/);
  assert.match(r.stderr, /run `git push` again/);
  assert.equal(versionOf(clone), '0.1.1');

  const log = git(clone, 'log', '-1', '--pretty=%s').stdout.trim();
  assert.equal(log, 'chore: v0.1.1');
  assert.equal(git(clone, 'status', '--porcelain').stdout.trim(), '', 'nothing left uncommitted');
});

test('the second push passes with no further commits', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);
  assert.equal(runHook(clone).status, 1);
  const afterBump = git(clone, 'rev-parse', 'HEAD').stdout.trim();

  const second = runHook(clone);
  assert.equal(second.status, 0, 'the bumped version must satisfy the guard');
  assert.match(second.stderr, /0\.1\.1 > origin\/main 0\.1\.0 ✔/);
  assert.equal(git(clone, 'rev-parse', 'HEAD').stdout.trim(), afterBump, 'no second commit');
});

test('a hand-set patch is overridden using the remote as reference', () => {
  const { clone } = repoWithRemote('1.0.1');
  commitWork(clone);
  writeVersion(clone, '1.0.10');
  git(clone, 'commit', '-am', 'hand-set the patch');

  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ignoring hand-set patch 1\.0\.10/);
  assert.equal(versionOf(clone), '1.0.2', 'patch comes from the remote, not from what was typed');
});

test('a hand-raised minor is respected and not rewritten', () => {
  const { clone } = repoWithRemote('1.0.7');
  writeVersion(clone, '1.1.0');
  git(clone, 'commit', '-am', 'bump minor');

  const r = runHook(clone);
  assert.equal(r.status, 0, '1.1.0 already leads 1.0.7');
  assert.equal(versionOf(clone), '1.1.0');
  assert.equal(git(clone, 'log', '-1', '--pretty=%s').stdout.trim(), 'bump minor', 'no version commit added');
});

test('a version behind the remote is refused outright', () => {
  const { clone } = repoWithRemote('1.2.0');
  writeVersion(clone, '1.1.5');
  git(clone, 'commit', '-am', 'stale version');

  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /behind origin\/main at 1\.2\.0/);
  assert.equal(versionOf(clone), '1.1.5', 'a refusal must not rewrite the file');
});

test('an uncommitted version edit is corrected, not refused', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);
  writeVersion(clone, '0.1.10'); // typed by hand, never committed

  const r = runHook(clone);
  assert.equal(r.status, 1, 'push stops so the bump can join the next one');
  assert.match(r.stderr, /ignoring hand-set patch 0\.1\.10/);
  assert.equal(versionOf(clone), '0.1.1', 'patch comes from origin/main');
  assert.equal(git(clone, 'status', '--porcelain').stdout.trim(), '', 'the edit was committed, not left behind');
});

test('other uncommitted package.json changes are refused rather than folded in', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);
  const pkg = JSON.parse(fs.readFileSync(path.join(clone, 'package.json'), 'utf8'));
  pkg.description = 'work in progress';
  fs.writeFileSync(path.join(clone, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /beyond the version/);
  assert.match(fs.readFileSync(path.join(clone, 'package.json'), 'utf8'), /work in progress/, 'edit survives');
});

test('a version-only push is refused instead of bumped again', () => {
  const { clone } = repoWithRemote('0.1.0');

  // A real change, then the bump the hook makes for it.
  fs.writeFileSync(path.join(clone, 'feature.txt'), 'work\n');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-m', 'real work');
  assert.equal(runHook(clone).status, 1, 'first push bumps');
  assert.equal(versionOf(clone), '0.1.1');

  // Ship it, so origin/main now has both the work and 0.1.1.
  git(clone, 'push', '-q', 'origin', 'main');
  git(clone, 'fetch', '-q', 'origin');

  // Push again with nothing new: no bump, no commit, a plain refusal.
  const head = git(clone, 'rev-parse', 'HEAD').stdout.trim();
  const again = runHook(clone);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /nothing to push/);
  assert.equal(git(clone, 'rev-parse', 'HEAD').stdout.trim(), head, 'no ratchet commit');
  assert.equal(versionOf(clone), '0.1.1', 'version untouched');
});

test('a lone version commit does not justify another version commit', () => {
  const { clone } = repoWithRemote('0.1.0');

  // Exactly the state the ratchet produced: a version commit and nothing else.
  writeVersion(clone, '0.1.1');
  git(clone, 'commit', '-am', 'chore: v0.1.1');

  const head = git(clone, 'rev-parse', 'HEAD').stdout.trim();
  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no changes to release/);
  assert.equal(git(clone, 'rev-parse', 'HEAD').stdout.trim(), head, 'no second version commit');
});

test('a deliberate minor release may be pushed on its own', () => {
  const { clone } = repoWithRemote('0.1.7');
  writeVersion(clone, '0.2.0');
  git(clone, 'commit', '-am', 'release 0.2.0');

  const r = runHook(clone);
  assert.equal(r.status, 0, 'a minor bump is a release in its own right');
  assert.equal(versionOf(clone), '0.2.0');
});

test('staged changes are caught, not folded into the version commit', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);
  const pkgPath = path.join(clone, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.description = 'work in progress';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  git(clone, 'add', 'package.json'); // staged — invisible to a plain `git diff`

  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pending changes beyond the version/);
  assert.match(fs.readFileSync(pkgPath, 'utf8'), /work in progress/, 'the staged edit survives');
  assert.doesNotMatch(git(clone, 'log', '-1', '--pretty=%s').stdout, /^chore: v/, 'no version commit was made');
});

test('pushing a branch other than the checked-out one never commits to HEAD', () => {
  const { clone } = repoWithRemote('0.1.0');
  git(clone, 'checkout', '-q', '-b', 'feature-a');
  commitWork(clone); // real work on the branch, still carrying 0.1.0
  git(clone, 'checkout', '-q', 'main'); // and we push it from main
  const mainBefore = git(clone, 'rev-parse', 'main').stdout.trim();

  const r = runHook(clone, {
    stdin: 'refs/heads/feature-a abc123 refs/heads/feature-a 0000000000000000000000000000000000000000\n',
  });

  assert.equal(r.status, 1, 'a stale version on the pushed branch must not pass');
  assert.match(r.stderr, /feature-a carries 0\.1\.0/);
  assert.match(r.stderr, /Check that branch out/);
  assert.equal(git(clone, 'rev-parse', 'main').stdout.trim(), mainBefore, 'main must not gain a commit');
  assert.equal(versionOf(clone), '0.1.0', 'the working tree is untouched');
});

test('a version field with unusual spacing is still rewritten', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);
  fs.writeFileSync(path.join(clone, 'package.json'), '{\n  "name": "demo",\n  "version" : "0.1.0"\n}\n');
  git(clone, 'commit', '-am', 'reformat');

  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.equal(versionOf(clone), '0.1.1', 'a space before the colon must not silently no-op');
});

test('SKIP_VERSION_BUMP and tag pushes are left alone', () => {
  const { clone } = repoWithRemote('0.1.0');

  const skipped = runHook(clone, { env: { SKIP_VERSION_BUMP: '1' } });
  assert.equal(skipped.status, 0);
  assert.equal(versionOf(clone), '0.1.0', 'nothing touched');

  const tagPush = runHook(clone, { stdin: 'refs/tags/v1 abc123 refs/tags/v1 000000\n' });
  assert.equal(tagPush.status, 0);
  assert.equal(versionOf(clone), '0.1.0', 'tag pushes carry no version meaning');
});

test('the hook chain stops at the version guard before spending a review', () => {
  const { clone } = repoWithRemote('0.1.0');
  commitWork(clone);

  // Wire up the real chain: .githooks/pre-push, the guard, and a stub review that
  // leaves a marker file if it ever runs.
  fs.mkdirSync(path.join(clone, '.githooks'), { recursive: true });
  fs.mkdirSync(path.join(clone, 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(REPO, '.githooks', 'pre-push'), path.join(clone, '.githooks', 'pre-push'));
  fs.copyFileSync(HOOK, path.join(clone, 'hooks', 'version-bump.mjs'));
  const marker = path.join(clone, 'review-ran');
  fs.writeFileSync(path.join(clone, 'hooks', 'pr-review-run'), `#!/bin/sh\ntouch "${marker}"\n`);
  fs.chmodSync(path.join(clone, 'hooks', 'pr-review-run'), 0o755);
  fs.chmodSync(path.join(clone, '.githooks', 'pre-push'), 0o755);

  const blocked = spawnSync(path.join(clone, '.githooks', 'pre-push'), ['origin', 'url'], {
    cwd: clone,
    input: 'refs/heads/main abc123 refs/heads/main def456\n',
    encoding: 'utf8',
    env: { ...process.env, SKIP_VERSION_BUMP: '', HOME: clone },
  });

  assert.equal(blocked.status, 1, 'the chain must exit non-zero when the guard blocks');
  assert.ok(!fs.existsSync(marker), 'the review must not run behind a blocked version guard');

  // Second push: the guard passes, so the review is reached.
  const passed = spawnSync(path.join(clone, '.githooks', 'pre-push'), ['origin', 'url'], {
    cwd: clone,
    input: 'refs/heads/main abc123 refs/heads/main def456\n',
    encoding: 'utf8',
    env: { ...process.env, SKIP_VERSION_BUMP: '', HOME: clone },
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.ok(fs.existsSync(marker), 'a passing guard must hand off to the review');
});

test('a branch deletion is not treated as a release', () => {
  const { clone } = repoWithRemote('0.1.0');
  const del = runHook(clone, {
    stdin: 'refs/heads/gone 0000000000000000000000000000000000000000 refs/heads/gone abc123\n',
  });
  assert.equal(del.status, 0);
  assert.equal(versionOf(clone), '0.1.0');
});
