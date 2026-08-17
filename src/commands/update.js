import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PKG_ROOT } from '../paths.js';
import { exists } from '../fsutil.js';

const git = (root, args, opts = {}) =>
  spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', ...opts });

function pkg() {
  return JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
}

/**
 * How this copy of oac was installed. A git checkout — the usual case when it
 * was linked with `npm link` or installed from a local path — updates with a
 * pull; a published copy updates through npm.
 */
export function installMode(root = PKG_ROOT) {
  return exists(path.join(root, '.git')) ? 'source' : 'global';
}

export function updateFromGit(root, { check } = {}) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const upstream = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream.status !== 0) {
    console.log(`\n  ${root}`);
    console.log(`  Branch "${branch}" has no upstream — nothing to pull from.`);
    console.log(`  Set one with:  git -C ${root} branch --set-upstream-to=origin/${branch}\n`);
    return;
  }

  const fetched = git(root, ['fetch', '--quiet']);
  if (fetched.status !== 0) throw new Error(`git fetch failed:\n${fetched.stderr.trim()}`);

  const pending = git(root, ['log', '--oneline', 'HEAD..@{u}']).stdout.trim();
  console.log(`\n  ${root}  (${branch} → ${upstream.stdout.trim()})`);

  if (!pending) {
    console.log(`  ✔ Already up to date at ${pkg().version}.\n`);
    return;
  }

  const count = pending.split('\n').length;
  console.log(`\n  ${count} new commit(s):`);
  for (const line of pending.split('\n')) console.log(`      ${line}`);

  if (check) {
    console.log(`\n  Run "oac update" to pull.\n`);
    return;
  }

  // A dirty tree is refused rather than merged into. Losing uncommitted work to
  // an update is never worth the convenience.
  const dirty = git(root, ['status', '--porcelain']).stdout.trim();
  if (dirty) {
    console.log(`\n  ✖ Working tree is not clean — refusing to pull.`);
    console.log(`    Commit or stash these first (untracked files included):\n`);
    for (const line of dirty.split('\n').slice(0, 15)) console.log(`      ${line}`);
    if (dirty.split('\n').length > 15) console.log(`      … and more`);
    console.log('');
    process.exitCode = 1;
    return;
  }

  const before = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const pulled = git(root, ['pull', '--ff-only'], { stdio: 'inherit' });
  if (pulled.status !== 0) throw new Error('git pull --ff-only failed — resolve it by hand and re-run.');

  // Dependencies only need reinstalling when the manifest actually moved.
  const changed = git(root, ['diff', '--name-only', `${before}..HEAD`]).stdout;
  if (/^(package\.json|package-lock\.json|bun\.lock)$/m.test(changed)) {
    console.log(`\n  Dependencies changed — installing…`);
    const installed = spawnSync('npm', ['install'], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
    if (installed.status !== 0) throw new Error('npm install failed — run it by hand in ' + root);
  }

  console.log(`\n  ✔ Updated to ${pkg().version}.`);
  console.log(`  → Run "oac sync" in your projects to pick up catalog changes.\n`);
}

/**
 * `github:owner/repo` from the manifest's repository URL — the install spec npm
 * accepts for a package that isn't on the registry.
 */
export function gitSpec(repoUrl) {
  const m = String(repoUrl || '').match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return m ? `github:${m[1]}/${m[2]}` : null;
}

function updateFromNpm({ check }) {
  const meta = pkg();
  const { name, version } = meta;
  const view = spawnSync('npm', ['view', name, 'version'], { encoding: 'utf8' });

  // Not on the registry: this copy came from the repository, so refresh it from
  // there. Publishing later switches this to the registry path automatically.
  if (view.status !== 0) {
    const spec = gitSpec(meta.repository?.url || meta.repository);
    if (!spec) {
      throw new Error(`${name} is not on npm and package.json has no GitHub repository URL to update from.`);
    }
    console.log(`\n  ${name} ${version} — not published to npm, updating from ${spec}`);
    if (check) {
      console.log(`\n  Run "oac update" to reinstall from the repository.\n`);
      return;
    }
    const installed = spawnSync('npm', ['i', '-g', spec], { stdio: 'inherit' });
    if (installed.status !== 0) throw new Error(`npm i -g ${spec} failed.`);
    console.log(`\n  ✔ Reinstalled from ${spec}.`);
    console.log(`  → Run "oac sync" in your projects to pick up catalog changes.\n`);
    return;
  }

  const latest = view.stdout.trim();
  console.log(`\n  ${name}  installed ${version}, latest ${latest}`);
  if (latest === version) {
    console.log(`  ✔ Already up to date.\n`);
    return;
  }
  if (check) {
    console.log(`\n  Run "oac update" to install ${latest}.\n`);
    return;
  }

  const installed = spawnSync('npm', ['i', '-g', `${name}@latest`], { stdio: 'inherit' });
  if (installed.status !== 0) throw new Error('npm install failed.');
  console.log(`\n  ✔ Updated to ${latest}.`);
  console.log(`  → Run "oac sync" in your projects to pick up catalog changes.\n`);
}

export async function cmdUpdate(ctx) {
  const opts = { check: Boolean(ctx.flags.check) };
  if (installMode() === 'source') return updateFromGit(PKG_ROOT, opts);
  return updateFromNpm(opts);
}
