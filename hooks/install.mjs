#!/usr/bin/env node
//
// Point this repo at its own hooks directory. A repo-local core.hooksPath wins
// over a global one, so the version guard keeps running even when something else
// (git-lfs, for one) overwrites the global hooks directory.
//
//   npm run hooks:install

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

const root = git('rev-parse', '--show-toplevel').stdout.trim();
if (!root) {
  console.error('  ✖ not inside a git repository');
  process.exit(1);
}

const hookDir = path.join(root, '.githooks');
const hook = path.join(hookDir, 'pre-push');
if (!existsSync(hook)) {
  console.error(`  ✖ ${path.relative(root, hook)} is missing — is this the agent-config repo?`);
  process.exit(1);
}

chmodSync(hook, 0o755);
const set = git('config', 'core.hooksPath', '.githooks');
if (set.status !== 0) {
  console.error(`  ✖ could not set core.hooksPath: ${set.stderr.trim()}`);
  process.exit(1);
}

console.log(`\n  ✔ core.hooksPath → .githooks (this repo only)`);

const global = git('config', '--global', 'core.hooksPath').stdout.trim();
if (global) {
  console.log(`    Overrides the global ${global} for this repo, deliberately.`);
}

console.log(`\n  On push, package.json's patch advances against origin/main.`);
console.log(`  A bump is committed and the push stops — push again to send it.`);
console.log(`\n  Uninstall:  git config --unset core.hooksPath`);
console.log(`  Bypass:     git push --no-verify\n`);
