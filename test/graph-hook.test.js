import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { installGraphHook, graphHookStatus, REFRESH_SCRIPT, GRAPH_HOOKS } from '../src/graphHook.js';
import { CI_VARS } from '../src/telemetry.js';

// Run from a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE. Every git
// call below would inherit them and commit into the real repo instead of the temp one.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'hooks', REFRESH_SCRIPT);
const POSIX = process.platform !== 'win32';
const real = (p) => fs.realpathSync(p);

// PATH without any real graphify, so nothing here ever runs the user's install.
const BASE_PATH = (process.env.PATH || '')
  .split(path.delimiter)
  .filter((d) => d && !fs.existsSync(path.join(d, 'graphify')) && !fs.existsSync(path.join(d, 'graphify.exe')))
  .join(path.delimiter);

/** A temp HOME with its own global git config, and an env pointing at both. */
function sandbox({ stub = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-graph-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const gitconfig = path.join(home, '.gitconfig');
  fs.writeFileSync(gitconfig, '[user]\n\tname = Test\n\temail = t@example.com\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n');
  const record = path.join(root, 'graphify-calls.txt');
  let PATH = BASE_PATH;
  if (stub) {
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    // Records where it ran and where it was told to write, then "builds" the graph.
    fs.writeFileSync(
      path.join(bin, 'graphify'),
      `#!/bin/sh\nprintf '%s|%s\\n' "$(pwd -P)" "$GRAPHIFY_OUT" >> "${record}"\nmkdir -p "$GRAPHIFY_OUT"\n`,
      { mode: 0o755 }
    );
    PATH = bin + path.delimiter + PATH;
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: gitconfig, PATH };
  for (const v of CI_VARS) delete env[v];
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  const calls = () => (fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim().split('\n') : []);
  return { root, home, env, git, calls };
}

/** A git repo with one commit. */
function makeRepo(sb, dir, { ignore = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  sb.git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  if (ignore) fs.writeFileSync(path.join(dir, '.gitignore'), 'graphify-out\n');
  sb.git(dir, 'add', '-A');
  sb.git(dir, 'commit', '-qm', 'first');
  return dir;
}

const MANIFEST = { skills: ['graphify'] };
const markRoot = (dir) => fs.writeFileSync(path.join(dir, 'agent.config.json'), '{}\n');
const count = (text, needle) => text.split(needle).length - 1;

test('global install wires every hook once, after the shebang, keeping the lfs line last', () => {
  const sb = sandbox();
  const hooks = path.join(sb.home, 'hooks');
  sb.git(sb.home, 'config', '--global', 'core.hooksPath', '~/hooks');
  fs.mkdirSync(hooks);
  const lfs = '#!/bin/sh\ncommand -v git-lfs >/dev/null 2>&1 || exit 2\ngit lfs post-commit "$@"\n';
  fs.writeFileSync(path.join(hooks, 'post-commit'), lfs);
  const project = makeRepo(sb, path.join(sb.root, 'proj'));

  for (let i = 0; i < 2; i++) {
    const res = installGraphHook(project, MANIFEST, { env: sb.env });
    assert.equal(res.mode, 'global');
    assert.deepEqual(res.warnings, []);
  }

  assert.ok(fs.existsSync(path.join(hooks, REFRESH_SCRIPT)));
  for (const hook of GRAPH_HOOKS) {
    const lines = fs.readFileSync(path.join(hooks, hook), 'utf8').trim().split('\n');
    assert.equal(lines[0], '#!/bin/sh');
    assert.equal(lines[1], `"$(dirname "$0")/${REFRESH_SCRIPT}" ${hook} "$@"`);
    assert.equal(count(lines.join('\n'), REFRESH_SCRIPT), 1, hook);
    if (POSIX) assert.equal(fs.statSync(path.join(hooks, hook)).mode & 0o777, 0o755);
  }
  const postCommit = fs.readFileSync(path.join(hooks, 'post-commit'), 'utf8').trim().split('\n');
  assert.equal(postCommit.at(-1), 'git lfs post-commit "$@"');
  assert.equal(postCommit.length, 4);
  // The project's own hooks directory is left alone.
  assert.ok(!fs.existsSync(path.join(project, '.git', 'hooks', REFRESH_SCRIPT)));
  assert.equal(graphHookStatus(project, sb.env).where, 'global');
});

test('without a global hooksPath it installs into the project, never setting one', () => {
  const sb = sandbox();
  const project = makeRepo(sb, path.join(sb.root, 'proj'));
  const res = installGraphHook(project, MANIFEST, { env: sb.env });
  assert.equal(res.mode, 'project');
  const hooks = path.join(project, '.git', 'hooks');
  assert.ok(fs.existsSync(path.join(hooks, REFRESH_SCRIPT)));
  for (const hook of GRAPH_HOOKS) assert.match(fs.readFileSync(path.join(hooks, hook), 'utf8'), /graphify-refresh/);
  assert.equal(spawnSync('git', ['config', '--global', 'core.hooksPath'], { env: sb.env }).status, 1);
  assert.equal(graphHookStatus(project, sb.env).where, 'project');

  // A repo-local core.hooksPath is where git looks, so that is where it goes.
  const other = makeRepo(sb, path.join(sb.root, 'other'));
  sb.git(other, 'config', 'core.hooksPath', '.githooks');
  assert.equal(installGraphHook(other, MANIFEST, { env: sb.env }).mode, 'project');
  assert.ok(fs.existsSync(path.join(other, '.githooks', 'post-merge')));
});

test('skipped when graphify is not selected, opted out, or not a git repo', () => {
  const sb = sandbox();
  const project = makeRepo(sb, path.join(sb.root, 'proj'));
  const hooks = path.join(project, '.git', 'hooks');
  assert.equal(installGraphHook(project, { skills: ['code-review'] }, { env: sb.env }).mode, 'skipped');
  assert.equal(installGraphHook(project, MANIFEST, { env: sb.env, flags: { 'no-graph-hook': true } }).mode, 'skipped');
  assert.equal(installGraphHook(project, { ...MANIFEST, graphHook: false }, { env: sb.env }).mode, 'skipped');
  assert.ok(!fs.existsSync(path.join(hooks, REFRESH_SCRIPT)));

  const plain = path.join(sb.root, 'plain');
  fs.mkdirSync(plain);
  const res = installGraphHook(plain, MANIFEST, { env: sb.env });
  assert.equal(res.mode, 'skipped');
  assert.match(res.warnings[0], /not a git repository/);
});

test('graphify-out is added to .gitignore once, and a missing CLI gets an install hint', () => {
  const sb = sandbox();
  const project = makeRepo(sb, path.join(sb.root, 'proj'), { ignore: false });
  fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules/');
  let res = installGraphHook(project, MANIFEST, { env: sb.env });
  assert.ok(res.lines.some((l) => l.includes('uv tool install graphifyy')));
  res = installGraphHook(project, MANIFEST, { env: sb.env });
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'node_modules/\ngraphify-out\n');
});

test('single-repo oac root: the first graph is built in-tree', { skip: !POSIX }, () => {
  const sb = sandbox({ stub: true });
  const project = makeRepo(sb, path.join(sb.home, 'work', 'app'));
  markRoot(project);
  installGraphHook(project, MANIFEST, { env: sb.env });
  assert.deepEqual(sb.calls(), [`${real(project)}|${path.join(real(project), 'graphify-out')}`]);
  // Second run: the graph exists, nothing is rebuilt.
  installGraphHook(project, MANIFEST, { env: sb.env });
  assert.equal(sb.calls().length, 1);
});

test('multi-repo oac root: every child repo is built into graphify-local', { skip: !POSIX }, () => {
  const sb = sandbox({ stub: true });
  const root = path.join(sb.home, 'work');
  makeRepo(sb, root, { ignore: false }); // the root is itself a git repo
  markRoot(root);
  const a = makeRepo(sb, path.join(root, 'a'));
  const b = makeRepo(sb, path.join(root, 'b'));
  const res = installGraphHook(root, MANIFEST, { env: sb.env });
  assert.deepEqual(res.warnings, []);
  const lib = (name) => path.join(real(root), 'graphify-local', 'repos', name, 'graphify-out');
  const calls = sb.calls();
  assert.ok(calls.includes(`${real(a)}|${lib('a')}`), calls.join('\n'));
  assert.ok(calls.includes(`${real(b)}|${lib('b')}`), calls.join('\n'));
  assert.equal(fs.readlinkSync(path.join(a, 'graphify-out')), lib('a'));
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^graphify-local\/$/m);
});

/** Run the shipped refresh script as a hook would, in `cwd`. */
function refresh(sb, cwd, ...args) {
  return spawnSync('sh', [SCRIPT, ...args], { cwd, env: sb.env, encoding: 'utf8' });
}

/** The script detaches its graphify run; wait for the stub to record it. */
async function waitForCalls(sb, n = 1) {
  for (let i = 0; i < 100 && sb.calls().length < n; i++) await new Promise((r) => setTimeout(r, 50));
  return sb.calls();
}
const settle = () => new Promise((r) => setTimeout(r, 300));

test('refresh script: multi-repo root resolves graphify-local and links it in', { skip: !POSIX }, async () => {
  const sb = sandbox({ stub: true });
  const root = path.join(sb.home, 'work');
  markRoot((fs.mkdirSync(root, { recursive: true }), root));
  const app = makeRepo(sb, path.join(root, 'app'));
  const out = path.join(root, 'graphify-local', 'repos', 'app', 'graphify-out');
  fs.mkdirSync(out, { recursive: true });

  assert.equal(refresh(sb, app, 'post-commit').status, 0);
  assert.deepEqual(await waitForCalls(sb), [`${real(app)}|${real(out)}`]);
  assert.equal(fs.readlinkSync(path.join(app, 'graphify-out')), real(out));
});

test('refresh script: a worktree outside the root resolves through its main repo', { skip: !POSIX }, async () => {
  const sb = sandbox({ stub: true });
  const root = path.join(sb.home, 'work');
  fs.mkdirSync(root, { recursive: true });
  markRoot(root);
  const app = makeRepo(sb, path.join(root, 'app'));
  const out = path.join(root, 'graphify-local', 'repos', 'app', 'graphify-out');
  fs.mkdirSync(out, { recursive: true });
  const wt = path.join(sb.home, 'elsewhere', 'wt');
  sb.git(app, 'worktree', 'add', '-q', wt);

  assert.equal(refresh(sb, wt, 'post-checkout', 'x', 'y', '1').status, 0);
  assert.deepEqual(await waitForCalls(sb), [`${real(wt)}|${real(out)}`]);
});

test('refresh script: single-repo root shares the main checkout graph with worktrees', { skip: !POSIX }, async () => {
  const sb = sandbox({ stub: true });
  const app = makeRepo(sb, path.join(sb.home, 'work', 'app'));
  markRoot(app);
  const out = path.join(app, 'graphify-out');
  fs.mkdirSync(out);
  const wt = path.join(sb.home, 'elsewhere', 'wt');
  sb.git(app, 'worktree', 'add', '-q', wt);

  assert.equal(refresh(sb, wt, 'post-merge', '0').status, 0);
  assert.deepEqual(await waitForCalls(sb), [`${real(wt)}|${real(out)}`]);
  assert.equal(fs.readlinkSync(path.join(wt, 'graphify-out')), real(out));
});

test('refresh script: no oac root, file checkouts and GRAPHIFY_SKIP_HOOK do nothing', { skip: !POSIX }, async () => {
  const sb = sandbox({ stub: true });
  const loose = makeRepo(sb, path.join(sb.home, 'loose'));
  assert.equal(refresh(sb, loose, 'post-commit').status, 0);

  const app = makeRepo(sb, path.join(sb.home, 'work', 'app'));
  markRoot(app);
  fs.mkdirSync(path.join(app, 'graphify-out'));
  assert.equal(refresh(sb, app, 'post-checkout', 'x', 'y', '0').status, 0);
  assert.equal(spawnSync('sh', [SCRIPT, 'post-commit'], { cwd: app, env: { ...sb.env, GRAPHIFY_SKIP_HOOK: '1' } }).status, 0);
  await settle();
  assert.deepEqual(sb.calls(), []);
});
