#!/usr/bin/env node
//
// Patch versions are owned by this hook, not by hand. Repo-local pre-push only —
// it must never be installed globally, or it would bump unrelated projects.
//
// Reference is the REMOTE base branch (origin/main by default), so the version
// always advances against what is actually published, not against local history.
//
//   local major.minor == remote  → patch becomes remote.patch + 1
//   local major.minor >  remote  → a deliberate minor/major bump, kept as-is
//   local            <  remote  → push refused
//
// When the version has to change, the hook commits it and stops the push. Git
// resolved the SHAs to send before this hook ran, so the new commit cannot join
// that push — run `git push` again and the second one carries it.
//
// Bypass:  git push --no-verify      or   SKIP_VERSION_BUMP=1 git push
// Base ref override:  OAC_VERSION_BASE_REF=origin/master git push

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const BASE_REF = process.env.OAC_VERSION_BASE_REF || 'origin/main';

const git = (args, opts = {}) => spawnSync('git', args, { encoding: 'utf8', ...opts });
const out = (msg) => process.stderr.write(msg);

function fail(msg) {
  out(`\n  ✖ version: ${msg}\n\n`);
  process.exit(1);
}

export function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export const fmt = (v) => v.join('.');

/** -1, 0, 1 on [major, minor, patch]. */
export function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

/**
 * The version this push must carry, given the remote base version.
 * Returns null when `local` is behind `remote` and the push should be refused.
 */
export function requiredVersion(remote, local) {
  if (!remote) return local; // nothing published yet: whatever is here is fine
  if (!local) return [remote[0], remote[1], remote[2] + 1];

  const sameLine = local[0] === remote[0] && local[1] === remote[1];
  if (sameLine) return [remote[0], remote[1], remote[2] + 1];

  const ahead = local[0] > remote[0] || (local[0] === remote[0] && local[1] > remote[1]);
  return ahead ? local : null;
}

function versionAt(root, rev) {
  const r = git(['show', `${rev}:package.json`], { cwd: root });
  if (r.status !== 0) return null;
  try {
    return parseSemver(JSON.parse(r.stdout).version);
  } catch {
    return null;
  }
}

/**
 * True when the working package.json differs from HEAD's only in the version
 * field — the ordinary "I typed a version" case, safe to overwrite.
 */
function onlyVersionDiffers(root, raw) {
  const head = git(['show', 'HEAD:package.json'], { cwd: root });
  if (head.status !== 0) return false;
  try {
    const strip = (text) => {
      const o = JSON.parse(text);
      delete o.version;
      return JSON.stringify(o);
    };
    return strip(head.stdout) === strip(raw);
  } catch {
    return false;
  }
}

/** True when every ref on stdin is a deletion or a tag — nothing to version. */
function nothingToVersion(stdin) {
  const lines = stdin.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false; // no stdin (manual run): proceed
  return lines.every((line) => {
    const [localRef, localSha] = line.split(/\s+/);
    return /^0+$/.test(localSha || '') || String(localRef).startsWith('refs/tags/');
  });
}

function inProgress(root, name) {
  const p = git(['rev-parse', '--git-path', name], { cwd: root }).stdout.trim();
  return Boolean(p) && existsSync(path.resolve(root, p));
}

export function runHook(root, stdin = '') {
  if (process.env.SKIP_VERSION_BUMP === '1') return 0;
  if (nothingToVersion(stdin)) return 0;
  if (inProgress(root, 'MERGE_HEAD') || inProgress(root, 'rebase-merge') || inProgress(root, 'rebase-apply')) {
    out('\n  version: merge or rebase in progress — skipping\n\n');
    return 0;
  }

  const pkgPath = path.join(root, 'package.json');
  if (!existsSync(pkgPath)) return 0;

  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root }).stdout.trim();
  if (!branch) fail('HEAD is detached — check out a branch before pushing');

  // Refresh the base ref so the comparison is against what is really published.
  const remoteName = BASE_REF.split('/')[0];
  git(['fetch', '--quiet', remoteName], { cwd: root });

  if (git(['rev-parse', '--verify', '--quiet', BASE_REF], { cwd: root }).status !== 0) {
    out(`\n  version: ${BASE_REF} not found — nothing to compare against, skipping\n\n`);
    return 0;
  }

  const remote = versionAt(root, BASE_REF);
  const raw = readFileSync(pkgPath, 'utf8');
  let local;
  try {
    local = parseSemver(JSON.parse(raw).version);
  } catch {
    fail('package.json is not valid JSON');
  }
  if (!local) fail('package.json has no valid x.y.z version');

  const required = requiredVersion(remote, local);
  if (!required) {
    fail(`${fmt(local)} is behind ${BASE_REF} at ${fmt(remote)}.\n` + `    Merge ${BASE_REF} first, then push again.`);
  }

  if (compare(local, required) === 0) {
    out(`\n  version: ${fmt(local)} > ${BASE_REF} ${remote ? fmt(remote) : '—'} ✔\n\n`);
    return 0;
  }

  // The version has to move. Write it, commit it, and stop this push.
  // An uncommitted version edit is the normal flow and is safe to overwrite;
  // any *other* uncommitted change would be swept into the version commit.
  const dirty = git(['diff', '--name-only', '--', 'package.json'], { cwd: root }).stdout.trim();
  if (dirty && !onlyVersionDiffers(root, raw)) {
    fail(
      `package.json has uncommitted changes beyond the version — refusing to fold\n` +
        `    them into a version commit. Commit or stash them, then push again.`
    );
  }

  writeFileSync(pkgPath, raw.replace(/"version":\s*"[^"]*"/, `"version": "${fmt(required)}"`));
  const committed = git(
    ['commit', '--no-verify', '-m', `chore: v${fmt(required)}`, '--', 'package.json'],
    { cwd: root }
  );
  if (committed.status !== 0) {
    git(['checkout', '--', 'package.json'], { cwd: root });
    fail(`could not create the version commit:\n${committed.stderr.trim()}`);
  }

  const from = remote ? fmt(remote) : '—';
  const handEdited = remote && local[2] !== remote[2] + 1 && local[0] === remote[0] && local[1] === remote[1];
  out(`\n  version: ${BASE_REF} is ${from}\n`);
  if (handEdited) out(`  version: ignoring hand-set patch ${fmt(local)} — patches are automatic\n`);
  out(`  version: ${fmt(local)} → ${fmt(required)}, committed on ${branch}\n`);
  out(`\n  ✖ Push stopped — run \`git push\` again to send it.\n\n`);
  return 1;
}

function repoRoot() {
  const r = git(['rev-parse', '--show-toplevel']);
  if (r.status !== 0) fail('not inside a git repository');
  return r.stdout.trim();
}

// Only act when run as a hook. Importing this file (tests) must have no effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let stdin = '';
  try {
    stdin = readFileSync(0, 'utf8');
  } catch {
    /* no stdin when run by hand */
  }
  process.exit(runHook(repoRoot(), stdin));
}
