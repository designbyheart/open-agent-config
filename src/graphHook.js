import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { PKG_ROOT } from './paths.js';
import { isCI } from './telemetry.js';
import { MANIFEST_NAME } from './manifest.js';
import { exists, readText, writeText, ensureDir, chmodSafe } from './fsutil.js';

/**
 * The graphify refresh hook: keeps a project's knowledge graph current after
 * commit, merge and branch checkout. Installed by `init` and `sync` when the
 * graphify skill is selected.
 *
 * With a global `core.hooksPath`, the hook goes there and covers every repo.
 * Without one, it goes into this project only — setting a global hooksPath on
 * someone's behalf would silently disable every repo's `.git/hooks`.
 *
 * Nothing here throws: a hook that cannot be installed is a warning, not a
 * failed `init`.
 */

export const GRAPH_SKILL = 'graphify';
export const REFRESH_SCRIPT = 'graphify-refresh';
export const GRAPH_HOOKS = ['post-commit', 'post-merge', 'post-checkout'];
const REFRESH_SOURCE = path.join(PKG_ROOT, 'hooks', REFRESH_SCRIPT);

const homeOf = (env) => env.HOME || env.USERPROFILE || os.homedir();

function expandHome(p, env) {
  if (p === '~') return homeOf(env);
  if (p.startsWith('~/')) return path.join(homeOf(env), p.slice(2));
  return p;
}

function git(cwd, env, ...args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
}

/** Whether `cmd` resolves on the env's PATH. */
export function onPath(cmd, env = process.env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';').concat('') : [''];
  for (const dir of (env.PATH || env.Path || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (fs.statSync(path.join(dir, cmd + ext)).isFile()) return true;
      } catch {
        /* not here */
      }
    }
  }
  return false;
}

/** The global hooks directory, or null when no global `core.hooksPath` is set. */
export function globalHooksDir(env = process.env) {
  const r = git(homeOf(env), env, 'config', '--global', 'core.hooksPath');
  return r.ok && r.out ? path.resolve(homeOf(env), expandHome(r.out, env)) : null;
}

/** This project's hooks directory: its local `core.hooksPath`, else git's default. */
export function projectHooksDir(top, env = process.env) {
  const local = git(top, env, 'config', '--local', 'core.hooksPath');
  if (local.ok && local.out) return path.resolve(top, expandHome(local.out, env));
  const def = git(top, env, 'rev-parse', '--git-path', 'hooks');
  return def.ok && def.out ? path.resolve(top, def.out) : null;
}

const realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** Toplevel of the checkout containing `dir`, or null outside git. */
function checkoutTop(dir, env) {
  const r = git(dir, env, 'rev-parse', '--show-toplevel');
  return r.ok && r.out ? realpath(r.out) : null;
}

/**
 * The main repo behind a checkout: its directory (parent of the common git dir,
 * so a linked worktree living elsewhere maps back to it) and its name.
 */
function mainRepo(top, env) {
  const r = git(top, env, 'rev-parse', '--git-common-dir');
  if (!r.ok) return { dir: top, name: path.basename(top) };
  const common = realpath(path.resolve(top, r.out));
  const dir = path.dirname(common);
  const name = path.basename(common) === '.git' ? path.basename(dir) : path.basename(common, '.git');
  return { dir, name };
}

/**
 * The oac root above `start` (inclusive): the nearest folder holding the
 * manifest. Stops below $HOME and the filesystem root — a graph library is
 * scoped to an oac project, never machine-wide.
 */
export function findOacRoot(start, env = process.env) {
  const home = realpath(homeOf(env));
  let dir = realpath(start);
  while (dir !== home && dir !== path.dirname(dir)) {
    if (exists(path.join(dir, MANIFEST_NAME))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Where a checkout's graph lives — the same resolution graphify-refresh does:
 * a real in-tree graphify-out/ wins; else, under the oac root of the main repo,
 * in-tree in the main repo (single-repo root) or
 * <root>/graphify-local/repos/<repo>/graphify-out (multi-repo root).
 * Null when there is no oac root. The directory may not exist yet.
 */
export function graphDirFor(top, env = process.env) {
  const local = path.join(top, 'graphify-out');
  try {
    if (fs.lstatSync(local).isDirectory()) return local;
  } catch {
    /* none in tree */
  }
  const main = mainRepo(top, env);
  const root = findOacRoot(main.dir, env);
  if (!root) return null;
  if (root === main.dir) return path.join(main.dir, 'graphify-out');
  return path.join(root, 'graphify-local', 'repos', main.name, 'graphify-out');
}

/** Git repos directly under `root` (depth 1). */
function childRepos(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((d) => d.isDirectory() && exists(path.join(root, d.name, '.git')))
    .map((d) => path.join(root, d.name));
}

const LINE_RE = new RegExp(REFRESH_SCRIPT);
const hookLine = (hook) => `"$(dirname "$0")/${REFRESH_SCRIPT}" ${hook} "$@"`;

/**
 * Add the refresh call to one hook file, creating it when missing. The call goes
 * right after the shebang so an existing last line (`git lfs post-commit "$@"`)
 * keeps deciding the hook's exit code. Idempotent.
 */
export function wireHook(file, hook) {
  const line = hookLine(hook);
  if (!exists(file)) {
    writeText(file, `#!/bin/sh\n${line}\n`);
  } else {
    const text = readText(file).replace(/\r\n/g, '\n');
    if (!LINE_RE.test(text)) {
      const lines = text.split('\n');
      const at = lines[0]?.startsWith('#!') ? 1 : 0;
      lines.splice(at, 0, line);
      writeText(file, lines.join('\n'));
    }
  }
  chmodSafe(file, 0o755);
}

/** Copy the refresh script into `dir` and wire every graph hook to it. */
export function installInto(dir) {
  ensureDir(dir);
  const script = path.join(dir, REFRESH_SCRIPT);
  // Overwritten every time: this is how `oac sync` ships script upgrades.
  fs.copyFileSync(REFRESH_SOURCE, script);
  chmodSafe(script, 0o755);
  for (const hook of GRAPH_HOOKS) wireHook(path.join(dir, hook), hook);
}

/** Whether `dir` holds the refresh script and every hook calls it. */
export function installedIn(dir) {
  if (!dir || !exists(path.join(dir, REFRESH_SCRIPT))) return false;
  return GRAPH_HOOKS.every((h) => {
    const f = path.join(dir, h);
    return exists(f) && LINE_RE.test(readText(f));
  });
}

/**
 * Append `entry` to the repo's .gitignore unless git already ignores it. Checked
 * both as a file and as a directory: a `name/` pattern only matches directories
 * and the path may not exist yet.
 */
function ensureIgnored(top, env, entry) {
  const name = entry.replace(/\/$/, '');
  if (git(top, env, 'check-ignore', '-q', name).ok || git(top, env, 'check-ignore', '-q', `${name}/`).ok) return false;
  const file = path.join(top, '.gitignore');
  const prev = exists(file) ? readText(file) : '';
  const sep = prev && !prev.endsWith('\n') ? '\n' : '';
  writeText(file, `${prev}${sep}${entry}\n`);
  return true;
}

/** Symlink a library graph into the checkout, when gitignored. Best effort. */
function linkGraph(top, out, env) {
  const link = path.join(top, 'graphify-out');
  if (out === link) return;
  try {
    fs.lstatSync(link);
    return; // something is already there
  } catch {
    /* free */
  }
  if (!git(top, env, 'check-ignore', '-q', 'graphify-out').ok) return;
  try {
    fs.symlinkSync(out, link, 'dir');
  } catch {
    /* Windows without symlink rights */
  }
}

/**
 * First AST-only builds for checkouts that have no graph yet: the project
 * itself, and for a multi-repo oac root every git repo directly under it.
 */
function buildGraphs(projectDir, top, env, res) {
  const checkouts = new Set();
  if (top) checkouts.add(top);
  const root = findOacRoot(projectDir, env);
  if (root) for (const child of childRepos(root)) checkouts.add(realpath(child));

  const built = new Set();
  for (const checkout of checkouts) {
    const out = graphDirFor(checkout, env);
    if (!out) continue;
    if (exists(out) || built.has(out)) {
      linkGraph(checkout, out, env);
      continue;
    }
    ensureDir(path.dirname(out));
    // Same as the hook: graphify finds the repo from its cwd, not from git's env.
    const buildEnv = { ...env, GRAPHIFY_OUT: out };
    for (const key of Object.keys(buildEnv)) if (key.startsWith('GIT_')) delete buildEnv[key];
    const r = spawnSync('graphify', ['update', '.'], { cwd: checkout, env: buildEnv, encoding: 'utf8' });
    if (r.status !== 0 || !exists(out)) {
      res.warnings.push(`graphify build failed in ${checkout}; run "graphify update ." there by hand.`);
      continue;
    }
    built.add(out);
    linkGraph(checkout, out, env);
    res.lines.push(`Built the knowledge graph (AST-only) → ${out}`);
  }
}

/**
 * Install the graph hook for a project. Returns `{ mode, lines, warnings }`,
 * where mode is 'global' | 'project' | 'skipped' | 'failed' — catalog-safe, so
 * it can go to telemetry; `lines` and `warnings` are for the console only.
 */
export function installGraphHook(projectDir, manifest, { flags = {}, env = process.env } = {}) {
  const res = { mode: 'skipped', lines: [], warnings: [] };
  if (!(manifest.skills || []).includes(GRAPH_SKILL)) return res;
  if (flags['no-graph-hook'] || manifest.graphHook === false) return res;

  try {
    const top = checkoutTop(projectDir, env);
    const globalDir = globalHooksDir(env);

    if (globalDir) {
      installInto(globalDir);
      res.mode = 'global';
      res.lines.push(`graphify refresh hook installed globally → ${globalDir}`);
    } else if (!top) {
      res.warnings.push('graphify hook skipped: not a git repository and no global core.hooksPath.');
      return res;
    } else {
      const dir = projectHooksDir(top, env);
      if (!dir) throw new Error('no hooks directory');
      installInto(dir);
      res.mode = 'project';
      res.lines.push(`graphify refresh hook installed for this project → ${dir}`);
    }

    // No trailing slash: in most checkouts graphify-out is a symlink, which a
    // `graphify-out/` pattern would not ignore.
    if (top && ensureIgnored(top, env, 'graphify-out')) res.lines.push('Added graphify-out to .gitignore');
    // A multi-repo root that is itself a git repo must not pick up the library.
    const root = findOacRoot(projectDir, env);
    if (root && childRepos(root).length && checkoutTop(root, env) === root && ensureIgnored(root, env, 'graphify-local/')) {
      res.lines.push(`Added graphify-local/ to ${path.join(root, '.gitignore')}`);
    }

    if (!onPath('graphify', env)) {
      res.lines.push('graphify CLI not found — install it with: uv tool install graphifyy');
    } else if (!isCI(env)) {
      buildGraphs(projectDir, top, env, res);
    }
  } catch (err) {
    res.mode = 'failed';
    res.warnings.push(`graphify hook not installed: ${err.message}`);
  }
  return res;
}

/** Doctor's view: where the hook is installed (or null), and whether graphify is on PATH. */
export function graphHookStatus(projectDir, env = process.env) {
  let where = null;
  if (installedIn(globalHooksDir(env))) where = 'global';
  else {
    const top = checkoutTop(projectDir, env);
    if (top && installedIn(projectHooksDir(top, env))) where = 'project';
  }
  return { where, graphify: onPath('graphify', env) };
}
