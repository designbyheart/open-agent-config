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

/** Run the hook the way git does: refs on stdin. */
function runHook(dir, { stdin = 'refs/heads/main abc123 refs/heads/main def456\n', env = {} } = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: dir,
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, ...env },
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
  assert.equal(runHook(clone).status, 1);
  const afterBump = git(clone, 'rev-parse', 'HEAD').stdout.trim();

  const second = runHook(clone);
  assert.equal(second.status, 0, 'the bumped version must satisfy the guard');
  assert.match(second.stderr, /0\.1\.1 > origin\/main 0\.1\.0 ✔/);
  assert.equal(git(clone, 'rev-parse', 'HEAD').stdout.trim(), afterBump, 'no second commit');
});

test('a hand-set patch is overridden using the remote as reference', () => {
  const { clone } = repoWithRemote('1.0.1');
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
  writeVersion(clone, '0.1.10'); // typed by hand, never committed

  const r = runHook(clone);
  assert.equal(r.status, 1, 'push stops so the bump can join the next one');
  assert.match(r.stderr, /ignoring hand-set patch 0\.1\.10/);
  assert.equal(versionOf(clone), '0.1.1', 'patch comes from origin/main');
  assert.equal(git(clone, 'status', '--porcelain').stdout.trim(), '', 'the edit was committed, not left behind');
});

test('other uncommitted package.json changes are refused rather than folded in', () => {
  const { clone } = repoWithRemote('0.1.0');
  const pkg = JSON.parse(fs.readFileSync(path.join(clone, 'package.json'), 'utf8'));
  pkg.description = 'work in progress';
  fs.writeFileSync(path.join(clone, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  const r = runHook(clone);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /beyond the version/);
  assert.match(fs.readFileSync(path.join(clone, 'package.json'), 'utf8'), /work in progress/, 'edit survives');
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

test('a branch deletion is not treated as a release', () => {
  const { clone } = repoWithRemote('0.1.0');
  const del = runHook(clone, {
    stdin: 'refs/heads/gone 0000000000000000000000000000000000000000 refs/heads/gone abc123\n',
  });
  assert.equal(del.status, 0);
  assert.equal(versionOf(clone), '0.1.0');
});
