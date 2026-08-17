import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PKG_ROOT } from './paths.js';
import { exists, readText, writeText } from './fsutil.js';

/**
 * Anonymous usage counting.
 *
 * What is sent: the command name, oac/node/OS versions, how long it took, and
 * whether it succeeded. For `init`/`sync`, the catalog ids selected (targets,
 * stacks, skills) — these name things in *this repo*, not anything about the user.
 *
 * What is never sent: project names or descriptions, directory paths, file
 * contents, git remotes, hostnames, usernames, or error messages (which routinely
 * contain paths). Only an error's class or code goes out.
 *
 * Disabled by `oac telemetry off`, `OAC_TELEMETRY=0`, `DO_NOT_TRACK=1`, `--no-telemetry`,
 * or any detected CI environment. Fails silently and never blocks a command for
 * longer than the timeout below.
 */

// Mixpanel project token. This is a write-only, publishable key — it is meant to
// ship inside clients. Until it is filled in, telemetry is inert.
const TOKEN_PLACEHOLDER = 'REPLACE_WITH_MIXPANEL_PROJECT_TOKEN';
const MIXPANEL_TOKEN = process.env.OAC_MIXPANEL_TOKEN || TOKEN_PLACEHOLDER;

const ENDPOINT = 'https://api.mixpanel.com/track';
const TIMEOUT_MS = 1000;

const CI_VARS = ['CI', 'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI', 'JENKINS_URL'];

export function configPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'oac', 'config.json');
}

export function readConfig() {
  const file = configPath();
  if (!exists(file)) return {};
  try {
    return JSON.parse(readText(file));
  } catch {
    return {}; // a corrupt config must never break the CLI
  }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  try {
    writeText(configPath(), JSON.stringify(next, null, 2) + '\n');
  } catch {
    /* a read-only home directory is not an error worth surfacing */
  }
  return next;
}

/** Stable random id for this machine. Not derived from anything identifying. */
export function installId() {
  const cfg = readConfig();
  if (cfg.installId) return cfg.installId;
  const id = crypto.randomUUID();
  writeConfig({ installId: id, firstSeen: new Date().toISOString() });
  return id;
}

export function isCI() {
  return CI_VARS.some((v) => process.env[v]);
}

/** Why telemetry is off, or null when it is on. */
export function disabledReason(flags = {}) {
  if (MIXPANEL_TOKEN === TOKEN_PLACEHOLDER) return 'no project token configured';
  if (flags['no-telemetry']) return '--no-telemetry';
  if (process.env.DO_NOT_TRACK === '1' || process.env.DO_NOT_TRACK === 'true') return 'DO_NOT_TRACK';
  if (process.env.OAC_TELEMETRY === '0' || process.env.OAC_TELEMETRY === 'false') return 'OAC_TELEMETRY=0';
  if (readConfig().telemetry === false) return 'disabled by "oac telemetry off"';
  if (isCI()) return 'CI environment';
  return null;
}

export function isEnabled(flags = {}) {
  return disabledReason(flags) === null;
}

/** Printed once, the first time telemetry would actually send something. */
function noticeOnce() {
  if (readConfig().noticeShown) return;
  writeConfig({ noticeShown: true });
  process.stderr.write(
    '\n  oac collects anonymous usage counts (command name, version, platform) to see\n' +
      '  whether anyone but the author uses it. No paths, project names, or file contents.\n' +
      '  Turn it off any time:  oac telemetry off\n\n'
  );
}

// Extra properties a command contributes about itself, e.g. which targets were selected.
let context = {};
export function addContext(props) {
  context = { ...context, ...props };
}
export function resetContext() {
  context = {};
}

function version() {
  try {
    return JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

/** The exact payload that would be sent. Exported so tests can assert on it. */
export function buildEvent(command, props = {}) {
  return {
    event: 'cli_command',
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: installId(),
      $insert_id: crypto.randomUUID(),
      time: Math.floor(Date.now() / 1000),
      command,
      oac_version: version(),
      node_major: Number(process.versions.node.split('.')[0]),
      platform: process.platform,
      arch: process.arch,
      ci: isCI(),
      ...context,
      ...props,
    },
  };
}

/**
 * Send one event. Resolves either way — a failure here is never the user's problem.
 * Awaited by the caller so the request completes before the process exits, bounded
 * by TIMEOUT_MS so a dead network cannot hang the CLI.
 */
export async function track(command, props = {}, flags = {}) {
  if (!isEnabled(flags)) return false;
  noticeOnce();
  try {
    const res = await fetch(`${ENDPOINT}?ip=0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([buildEvent(command, props)]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
