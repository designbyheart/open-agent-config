import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { MANIFEST_NAME } from '../src/manifest.js';
import { CI_VARS } from '../src/telemetry.js';
import {
  applyTrim,
  removeTrim,
  installStep,
  getTrimTool,
  parseTrimFlag,
  resolveSyncTrim,
  detectOverlap,
} from '../src/trim.js';

// Run from a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE; nothing
// spawned here may inherit them.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'bin', 'cli.js');
const POSIX = process.platform !== 'win32';

/**
 * A temp HOME and a PATH holding only stub tools plus the system basics, so no
 * real rtk, llmtrim, brew or npm can ever run. Each stub appends its argv to a log.
 */
function sandbox({ tools = ['rtk', 'llmtrim'], extra = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-trim-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(home);
  fs.mkdirSync(bin);
  const log = path.join(root, 'calls.log');
  const stub = (name, body = '') =>
    `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`;
  const STUBS = {
    rtk: stub('rtk', 'case "$1" in --version) echo "rtk 1.0.1";; gain) [ -n "$RTK_GAIN_FAIL" ] && exit 1; echo "Tokens saved: 42";; esac'),
    llmtrim: stub('llmtrim', 'case "$1" in --version) echo "llmtrim 0.13.7";; status) echo "saved 1.2M tokens";; esac'),
  };
  fs.writeFileSync(path.join(root, 'rtk.stub'), STUBS.rtk, { mode: 0o755 });
  // `brew install rtk` "installs" the rtk stub.
  STUBS.brew = stub('brew', `[ "$1" = install ] && cp "${path.join(root, 'rtk.stub')}" "${path.join(bin, 'rtk')}"`);
  STUBS.npm = stub('npm');
  STUBS.curl = stub('curl');
  for (const name of [...tools, ...extra]) fs.writeFileSync(path.join(bin, name), STUBS[name], { mode: 0o755 });

  const gitconfig = path.join(home, '.gitconfig');
  fs.writeFileSync(gitconfig, '[user]\n\tname = Test\n\temail = t@example.com\n');
  const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: gitconfig, PATH: [bin, '/usr/bin', '/bin'].join(path.delimiter), OAC_TELEMETRY: '0' };
  for (const v of CI_VARS) delete env[v];
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);
  const project = path.join(root, 'proj');
  fs.mkdirSync(project);
  const oac = (args, extraEnv = {}) =>
    spawnSync(process.execPath, [CLI, ...args], { cwd: project, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  const manifest = () => JSON.parse(fs.readFileSync(path.join(project, MANIFEST_NAME), 'utf8'));
  return { root, home, bin, env, calls, project, oac, manifest };
}

const configureCalls = (calls) => calls.filter((c) => / init |llmtrim setup/.test(c));

test('--trim=rtk,llmtrim on init writes the manifest and configures each target once', { skip: !POSIX }, () => {
  const sb = sandbox();
  const r = sb.oac(['init', '--yes', '--targets=claude,codex,cursor,windsurf', '--trim=rtk,llmtrim']);
  assert.equal(r.status, 0, r.stderr);

  const m = sb.manifest();
  assert.deepEqual(m.trim.tools, ['rtk', 'llmtrim']);
  assert.deepEqual(m.trim.applied.rtk, { version: '1.0.1', targets: ['claude', 'codex', 'cursor'], installedWith: null });
  assert.deepEqual(m.trim.applied.llmtrim.targets, ['claude', 'codex', 'cursor']);
  assert.deepEqual(configureCalls(sb.calls()), [
    'rtk init -g --hook-only --auto-patch',
    'rtk init -g --codex',
    'rtk init -g --agent cursor --auto-patch',
    'llmtrim setup',
  ]);
  assert.ok(sb.calls().includes('rtk gain') && sb.calls().includes('llmtrim doctor'), 'each tool is verified');
  // oac writes rtk's rules itself, into every generated config.
  for (const f of ['CLAUDE.md', 'AGENTS.md', '.windsurfrules']) {
    assert.match(fs.readFileSync(path.join(sb.project, f), 'utf8'), /## Shell output \(rtk\)/, f);
  }

  // A second sync is silent: nothing new to configure.
  const before = configureCalls(sb.calls()).length;
  const s = sb.oac(['sync']);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(configureCalls(sb.calls()).length, before);
  assert.doesNotMatch(s.stdout, /rtk|llmtrim/);
  assert.equal(sb.oac(['doctor']).status, 0);
});

test('--trim=off declines: stored as false, nothing runs, no rtk rules', { skip: !POSIX }, () => {
  const sb = sandbox();
  assert.equal(sb.oac(['init', '--yes', '--targets=claude', '--trim=off']).status, 0);
  assert.equal(sb.manifest().trim, false);
  assert.deepEqual(sb.calls(), []);
  assert.doesNotMatch(fs.readFileSync(path.join(sb.project, 'CLAUDE.md'), 'utf8'), /rtk/);
});

test('without --trim, init leaves it undecided and a non-interactive sync never asks or installs', { skip: !POSIX }, () => {
  const sb = sandbox();
  assert.equal(sb.oac(['init', '--yes', '--targets=claude']).status, 0);
  assert.equal('trim' in sb.manifest(), false);
  assert.equal(sb.oac(['sync']).status, 0);
  assert.equal('trim' in sb.manifest(), false);
  assert.deepEqual(sb.calls(), []);
});

test('sync asks once: only while the manifest has no trim field', async () => {
  let asked = 0;
  const ask = async () => (asked++, ['rtk']);
  const env = {};
  assert.deepEqual(await resolveSyncTrim({}, {}, { ask, tty: true, env }), { tools: ['rtk'], applied: {} });
  assert.equal(asked, 1);
  // Decided either way → no prompt.
  assert.equal(await resolveSyncTrim({ trim: false }, {}, { ask, tty: true, env }), false);
  const on = { trim: { tools: ['llmtrim'], applied: {} } };
  assert.equal(await resolveSyncTrim(on, {}, { ask, tty: true, env }), on.trim);
  // No terminal, --yes, or CI → no prompt either.
  assert.equal(await resolveSyncTrim({}, {}, { ask, tty: false, env }), undefined);
  assert.equal(await resolveSyncTrim({}, { yes: true }, { ask, tty: true, env }), undefined);
  assert.equal(await resolveSyncTrim({}, {}, { ask, tty: true, env: { CI: '1' } }), undefined);
  // The flag decides without asking; cancelling keeps it undecided.
  assert.equal(await resolveSyncTrim({}, { trim: 'off' }, { ask, tty: true, env }), false);
  assert.equal(await resolveSyncTrim({}, {}, { ask: async () => null, tty: true, env }), undefined);
  assert.equal(asked, 1);
  assert.throws(() => parseTrimFlag('rtk,nope'), /Unknown token saver/);
});

test('installer per platform: brew when present, else the script; winget on Windows; npm for llmtrim', { skip: !POSIX }, () => {
  const rtk = getTrimTool('rtk');
  const withBrew = sandbox({ tools: [], extra: ['brew', 'curl', 'npm'] });
  const noBrew = sandbox({ tools: [], extra: ['curl'] });
  const only = (sb) => ({ ...sb.env, PATH: sb.bin });
  assert.equal(installStep(rtk, { platform: 'darwin', env: only(withBrew) }).run, 'brew install rtk');
  assert.match(installStep(rtk, { platform: 'darwin', env: only(noBrew) }).run, /^curl -fsSL .*install\.sh \| sh$/);
  assert.match(installStep(rtk, { platform: 'linux', env: only(noBrew) }).run, /install\.sh/);
  assert.equal(installStep(rtk, { platform: 'win32', env: only(noBrew) }), null);
  fs.writeFileSync(path.join(noBrew.bin, 'winget'), '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(installStep(rtk, { platform: 'win32', env: only(noBrew) }).run, 'winget install rtk-ai.rtk');
  assert.equal(installStep(getTrimTool('llmtrim'), { platform: 'darwin', env: only(withBrew) }).run, 'npm i -g @llmtrim/cli@latest');
});

test('a missing binary is installed, but only printed in --dry-run and skipped in CI', { skip: !POSIX }, () => {
  const fresh = () => ({ targets: ['claude'], trim: { tools: ['rtk'], applied: {} } });

  const dry = sandbox({ tools: [], extra: ['brew'] });
  const m1 = fresh();
  const r1 = applyTrim(m1, { flags: { 'dry-run': true }, env: dry.env, platform: 'darwin' });
  assert.deepEqual(r1.lines, ['would run: brew install rtk', 'would run: rtk init -g --hook-only --auto-patch']);
  assert.deepEqual(dry.calls(), []);
  assert.deepEqual(m1.trim.applied, {});

  const ci = sandbox({ tools: [], extra: ['brew'] });
  const r2 = applyTrim(fresh(), { env: { ...ci.env, CI: 'true' }, platform: 'darwin' });
  assert.match(r2.lines[0], /skipped in CI/);
  assert.deepEqual(ci.calls(), []);

  const real = sandbox({ tools: [], extra: ['brew'] });
  const m3 = fresh();
  const r3 = applyTrim(m3, { env: real.env, platform: 'darwin' });
  assert.deepEqual(r3.warnings, []);
  assert.deepEqual(real.calls().slice(0, 2), ['brew install rtk', 'rtk init -g --hook-only --auto-patch']);
  assert.deepEqual(m3.trim.applied.rtk, { version: '1.0.1', targets: ['claude'], installedWith: 'brew' });

  // Undo removes what oac installed, binary included.
  removeTrim(m3, 'rtk', { env: real.env });
  assert.deepEqual(real.calls().slice(-2), ['rtk init -g --uninstall', 'brew uninstall rtk']);
  assert.deepEqual(m3.trim.applied, {});

  // No installer available → a warning with where to look, never a throw.
  const none = sandbox({ tools: [] });
  const r4 = applyTrim(fresh(), { env: { ...none.env, PATH: none.bin }, platform: 'win32' });
  assert.match(r4.warnings[0], /oac trim help rtk/);
});

test('trim off rtk runs its uninstall, updates the manifest and drops the rules', { skip: !POSIX }, () => {
  const sb = sandbox();
  assert.equal(sb.oac(['init', '--yes', '--targets=claude,codex', '--trim=rtk,llmtrim']).status, 0);
  const r = sb.oac(['trim', 'off', 'rtk']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(sb.calls().includes('rtk init -g --uninstall'));
  assert.ok(sb.calls().includes('rtk init -g --codex --uninstall'));
  assert.ok(!sb.calls().includes('llmtrim uninstall'));
  const m = sb.manifest();
  assert.deepEqual(m.trim.tools, ['llmtrim']);
  assert.equal(m.trim.applied.rtk, undefined);
  assert.doesNotMatch(fs.readFileSync(path.join(sb.project, 'CLAUDE.md'), 'utf8'), /Shell output \(rtk\)/);
  assert.equal(sb.oac(['doctor']).status, 0, 'hash stays in step with the generated files');

  // Last one off → declined.
  assert.equal(sb.oac(['trim', 'off']).status, 0);
  assert.ok(sb.calls().includes('llmtrim uninstall'));
  assert.equal(sb.manifest().trim, false);
});

test('doctor warns when two shell-output savers are active, e.g. rtk + token-savior', { skip: !POSIX }, () => {
  const sb = sandbox();
  assert.equal(sb.oac(['init', '--yes', '--targets=claude', '--trim=rtk,llmtrim']).status, 0);
  let r = sb.oac(['doctor']);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /overlap/, 'rtk + llmtrim are different kinds');
  assert.match(r.stdout, /Token saver rtk 1\.0\.1 healthy/);

  fs.mkdirSync(path.join(sb.home, '.claude'));
  const hook = (command) => ({ matcher: 'Bash', hooks: [{ type: 'command', command }] });
  fs.writeFileSync(
    path.join(sb.home, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [hook('python3 -m token_savior.hooks.bash_rewriter_hook')] } })
  );
  r = sb.oac(['doctor']);
  assert.equal(r.status, 0, 'advisory: overlap never fails doctor');
  assert.match(r.stdout, /overlap on shell-output: rtk \+ token-savior/);

  // tool_capture_hook only counts when its matcher covers Bash.
  const capture = (matcher) => ({ hooks: { PostToolUse: [{ matcher, hooks: [{ command: 'python -m token_savior.hooks.tool_capture_hook' }] }] } });
  fs.writeFileSync(path.join(sb.home, '.claude', 'settings.json'), JSON.stringify(capture('WebFetch|Read')));
  assert.deepEqual(detectOverlap({ trim: { tools: ['rtk'] } }, sb.env).conflicts, []);
  fs.writeFileSync(path.join(sb.home, '.claude', 'settings.json'), JSON.stringify(capture('Read|Bash')));
  assert.deepEqual(detectOverlap({ trim: { tools: ['rtk'] } }, sb.env).conflicts, [{ kind: 'shell-output', ids: ['rtk', 'token-savior'] }]);
});

test('trim status tolerates a failing rtk gain', { skip: !POSIX }, () => {
  const sb = sandbox();
  assert.equal(sb.oac(['init', '--yes', '--targets=claude', '--trim=rtk,llmtrim']).status, 0);
  const r = sb.oac(['trim', 'status'], { RTK_GAIN_FAIL: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rtk — on, installed 1\.0\.1, configured for claude/);
  assert.match(r.stdout, /no savings summary; "rtk gain" failed/);
  assert.match(r.stdout, /saved 1\.2M tokens/);
  assert.equal(sb.oac(['trim', 'help', 'rtk']).status, 0);
  assert.notEqual(sb.oac(['trim', 'on', 'nope']).status, 0);
});
