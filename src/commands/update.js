import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { PKG_ROOT } from '../paths.js';
import { exists } from '../fsutil.js';

const git = (root, args, opts = {}) =>
  spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', ...opts });

function pkg() {
  return JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
}

/** The global command this package installs, and the one a rename fights over. */
const BIN_NAME = 'oac';

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

/** The global install prefix npm would write to, or null when npm can't be reached. */
function npmPrefix() {
  const r = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * The package that currently owns a global bin, or null when nothing does.
 *
 * npm refuses to install a bin another package already owns and fails with
 * EEXIST. The rename from `open-agent-config` to `@designbyheart/open-agent-config`
 * kept the `oac` bin, so every copy installed before the rename sits on that name
 * and blocks the update until it is removed.
 */
export function globalBinOwner(binName = BIN_NAME, prefix = npmPrefix()) {
  if (!prefix) return null;
  // POSIX links the shim into <prefix>/bin; Windows writes it beside the prefix.
  const shim = [path.join(prefix, 'bin', binName), path.join(prefix, binName)].find((p) => exists(p));
  if (!shim) return null;

  let target;
  try {
    target = realpathSync(shim);
  } catch {
    return null;
  }
  // Only something inside node_modules can be attributed to a package; a shim
  // pointing anywhere else (a hand-rolled script, a stray file) is not ours to touch.
  if (!target.includes(`${path.sep}node_modules${path.sep}`)) return null;

  for (let dir = path.dirname(target); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (!existsSync(file)) continue;
    try {
      const meta = JSON.parse(readFileSync(file, 'utf8'));
      if (meta.name) return { name: meta.name, version: meta.version || null, dir };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Free the `oac` bin so npm has somewhere to install. Only a *differently named*
 * owner is removed — replacing one version of this package with another is npm's
 * own job, and doing it by hand would delete the copy we are about to upgrade.
 * Returns true when a conflict was found (reported under --check, removed otherwise).
 */
export function clearBinConflict(name, { check, owner = globalBinOwner() } = {}) {
  if (!owner || owner.name === name) return false;

  const at = owner.version ? `@${owner.version}` : '';
  console.log(`\n  "${BIN_NAME}" is owned by ${owner.name}${at}, which ${name} replaces.`);
  if (check) {
    console.log(`  Run "oac update" to remove it and install ${name}.`);
    return true;
  }

  console.log(`  Removing it first — npm will not install over another package's bin…`);
  const removed = spawnSync('npm', ['uninstall', '-g', owner.name], { stdio: 'inherit' });
  if (removed.status !== 0) {
    throw new Error(
      `Could not remove ${owner.name}.\n` +
        `  Run "npm uninstall -g ${owner.name}" by hand, then re-run "oac update".`
    );
  }
  return true;
}

/** Install a spec globally, clearing a predecessor off the bin first. */
function installGlobal(spec, name) {
  clearBinConflict(name);
  const installed = spawnSync('npm', ['i', '-g', spec], { stdio: 'inherit' });
  if (installed.status === 0) return;

  // The pre-flight check missed it — say which package to remove rather than
  // leaving npm's bare EEXIST as the last word.
  const owner = globalBinOwner();
  const hint =
    owner && owner.name !== name
      ? `\n  npm reported the "${BIN_NAME}" bin as taken by ${owner.name} — remove it with:` +
        `\n  npm uninstall -g ${owner.name}`
      : `\n  If npm reported EEXIST on "${BIN_NAME}", another package still owns that bin.`;
  throw new Error(`npm i -g ${spec} failed.${hint}`);
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

  // GitHub Packages needs credentials even to read, so a failed lookup is no longer
  // proof the package is unpublished. Downgrading a registry install to a git one
  // over an expired token would be a silent, surprising demotion — say so instead.
  if (view.status !== 0 && !/E404|404 Not Found/.test(view.stderr || '')) {
    throw new Error(
      `Could not reach the registry for ${name}.\n` +
        '  Check your network, or that ~/.npmrc still has a valid token for\n' +
        '  https://npm.pkg.github.com (a GitHub PAT with read:packages).'
    );
  }

  // Genuinely not on the registry: this copy came from the repository, so refresh it
  // from there. Publishing later switches this to the registry path automatically.
  if (view.status !== 0) {
    const spec = gitSpec(meta.repository?.url || meta.repository);
    if (!spec) {
      throw new Error(`${name} is not on npm and package.json has no GitHub repository URL to update from.`);
    }
    console.log(`\n  ${name} ${version} — not published to npm, updating from ${spec}`);
    if (check) {
      clearBinConflict(name, { check });
      console.log(`\n  Run "oac update" to reinstall from the repository.\n`);
      return;
    }
    installGlobal(spec, name);
    console.log(`\n  ✔ Reinstalled from ${spec}.`);
    console.log(`  → Run "oac sync" in your projects to pick up catalog changes.\n`);
    return;
  }

  const latest = view.stdout.trim();
  console.log(`\n  ${name}  installed ${version}, latest ${latest}`);

  // An older copy under the pre-rename name reports its own version, so "same
  // version" is only really up to date once this package owns the bin.
  const conflicted = latest === version && clearBinConflict(name, { check });
  if (latest === version && !conflicted) {
    console.log(`  ✔ Already up to date.\n`);
    return;
  }
  if (check) {
    console.log(`\n  Run "oac update" to install ${latest}.\n`);
    return;
  }

  installGlobal(`${name}@latest`, name);
  console.log(`\n  ✔ Updated to ${latest}.`);
  console.log(`  → Run "oac sync" in your projects to pick up catalog changes.\n`);
}

export async function cmdUpdate(ctx) {
  const opts = { check: Boolean(ctx.flags.check) };
  if (installMode() === 'source') return updateFromGit(PKG_ROOT, opts);
  return updateFromNpm(opts);
}
