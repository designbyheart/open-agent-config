import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'bin', 'cli.js');

/** Isolate XDG_CONFIG_HOME so tests never read or write the real user config. */
function sandbox(extraEnv = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-tel-'));
  return {
    home,
    env: { ...process.env, XDG_CONFIG_HOME: home, OAC_MIXPANEL_TOKEN: 'test-token', CI: '', ...extraEnv },
  };
}

/** Import telemetry.js fresh, with env applied, so module-level token is re-read. */
async function loadTelemetry(env) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === '') delete process.env[k];
  const mod = await import(`../src/telemetry.js?t=${Math.random()}`);
  return {
    mod,
    restore: () => {
      for (const k of Object.keys(process.env)) delete process.env[k];
      Object.assign(process.env, saved);
    },
  };
}

test('the payload carries no paths, project names, or user identity', async () => {
  const { env } = sandbox();
  const { mod, restore } = await loadTelemetry(env);
  try {
    mod.addContext({ targets: ['claude'], skills: ['code-review'] });
    const event = mod.buildEvent('init', { outcome: 'ok', duration_ms: 12 });
    const json = JSON.stringify(event);

    // Nothing derived from the machine or the project may appear.
    for (const forbidden of [os.homedir(), os.hostname(), os.userInfo().username, REPO, process.cwd()]) {
      if (!forbidden) continue;
      assert.ok(!json.includes(forbidden), `payload leaked "${forbidden}": ${json}`);
    }
    assert.doesNotMatch(json, /\/Users\/|\/home\/|C:\\\\/, 'no filesystem paths');

    const keys = Object.keys(event.properties).sort();
    assert.deepEqual(keys, [
      '$insert_id', 'arch', 'ci', 'command', 'distinct_id', 'duration_ms',
      'node_major', 'oac_version', 'outcome', 'platform', 'skills', 'targets',
      'time', 'token',
    ], 'the property set must stay closed — new fields need a deliberate review');
  } finally {
    mod.resetContext();
    restore();
  }
});

test('the install id is a random uuid, stable across calls, stored outside the project', async () => {
  const { home, env } = sandbox();
  const { mod, restore } = await loadTelemetry(env);
  try {
    const first = mod.installId();
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(mod.installId(), first, 'must be stable');
    assert.ok(mod.configPath().startsWith(home), 'config lives in XDG config, not the repo');
  } finally {
    restore();
  }
});

test('every documented opt-out disables sending', async () => {
  const cases = [
    ['DO_NOT_TRACK', { DO_NOT_TRACK: '1' }, {}],
    ['OAC_TELEMETRY=0', { OAC_TELEMETRY: '0' }, {}],
    ['CI', { CI: 'true' }, {}],
    ['--no-telemetry', {}, { 'no-telemetry': true }],
  ];
  for (const [label, envPatch, flags] of cases) {
    const { env } = sandbox(envPatch);
    const { mod, restore } = await loadTelemetry(env);
    try {
      assert.equal(mod.isEnabled(flags), false, `${label} must disable telemetry`);
      assert.equal(await mod.track('sync', {}, flags), false, `${label} must not send`);
    } finally {
      restore();
    }
  }
});

test('an unconfigured token makes telemetry inert rather than broken', async () => {
  const { env } = sandbox({ OAC_MIXPANEL_TOKEN: '' });
  const { mod, restore } = await loadTelemetry(env);
  try {
    assert.equal(mod.isEnabled(), false);
    assert.match(mod.disabledReason(), /no project token/);
  } finally {
    restore();
  }
});

test('"telemetry off" is persisted and honoured on the next run', async () => {
  const { home, env } = sandbox();
  const off = spawnSync(process.execPath, [CLI, 'telemetry', 'off'], { encoding: 'utf8', env });
  assert.equal(off.status, 0, off.stderr);

  const cfg = JSON.parse(fs.readFileSync(path.join(home, 'oac', 'config.json'), 'utf8'));
  assert.equal(cfg.telemetry, false);

  const status = spawnSync(process.execPath, [CLI, 'telemetry'], { encoding: 'utf8', env });
  assert.match(status.stdout, /Telemetry: off/);
  assert.match(status.stdout, /oac telemetry off/, 'status explains how to change it');
});

test('telemetry status shows the real payload shape, with the token redacted', () => {
  const { env } = sandbox();
  const r = spawnSync(process.execPath, [CLI, 'telemetry', 'status'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"command": "sync"/);
  assert.match(r.stdout, /"token": "<project token>"/, 'never print the real token');
});

test('a command still succeeds when the telemetry endpoint is unreachable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-offline-'));
  const { env } = sandbox();
  // Point the network at nothing: an unroutable proxy makes fetch fail fast.
  const r = spawnSync(process.execPath, [CLI, 'init', '--yes', '--targets=claude'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...env, HTTPS_PROXY: 'http://127.0.0.1:1', https_proxy: 'http://127.0.0.1:1' },
  });
  assert.equal(r.status, 0, `init must survive a dead telemetry endpoint: ${r.stderr}`);
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')));
});

test('the first-run notice appears once, on stderr, and never again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-notice-'));
  const { env } = sandbox();
  const run = () =>
    spawnSync(process.execPath, [CLI, 'doctor'], { cwd: dir, encoding: 'utf8', env });

  const first = run();
  assert.match(first.stderr, /anonymous usage counts/, 'users must be told on first send');
  assert.match(first.stderr, /oac telemetry off/, 'and told how to stop it');

  const second = run();
  assert.doesNotMatch(second.stderr, /anonymous usage counts/, 'notice must not repeat');
});
