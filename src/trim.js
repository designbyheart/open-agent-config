import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadTrimTools } from './catalog.js';
import { isCI } from './telemetry.js';
import { onPath } from './graphHook.js';
import { exists, readText } from './fsutil.js';

/**
 * Opt-in token savers ("oac trim"): rtk for shell output, llmtrim for whole
 * request payloads. oac asks, installs, configures, syncs and explains them,
 * always through each tool's own installer — it never edits their config itself.
 *
 * Manifest shape: `trim: false` (declined), or
 * `trim: { tools: ['rtk'], applied: { rtk: { version, targets, installedWith } } }`.
 * No `trim` key means undecided: an interactive `oac sync` asks once.
 *
 * Nothing here throws: a failed install is a ⚠ line with the command to run by
 * hand, not a failed `init`.
 */

const TIMEOUT_MS = 120_000;
const homeOf = (env) => env.HOME || env.USERPROFILE || os.homedir();

export function trimCatalog() {
  return loadTrimTools();
}

export function getTrimTool(id) {
  return loadTrimTools().find((t) => t.id === id);
}

/** Enabled tool ids from a manifest. */
export function enabledTrim(manifest) {
  return (manifest?.trim && manifest.trim.tools) || [];
}

/**
 * `--trim=rtk,llmtrim` → ['rtk', 'llmtrim']; `--trim=off` → false; absent → undefined.
 * Unknown ids are an error, like unknown skills.
 */
export function parseTrimFlag(value) {
  if (value === undefined) return undefined;
  if (value === true) throw new Error('Usage: --trim=rtk,llmtrim or --trim=off');
  const ids = String(value)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!ids.length || (ids.length === 1 && ['off', 'none', 'false'].includes(ids[0]))) return false;
  const known = new Set(loadTrimTools().map((t) => t.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown token saver(s): ${unknown.join(', ')}. See "oac trim help".`);
  return [...new Set(ids)];
}

/** The manifest `trim` value for a choice, keeping what was applied so it can be undone. */
export function trimFromChoice(choice, previous) {
  const applied = (previous && previous.applied) || {};
  if (choice === undefined) return previous;
  const tools = choice || [];
  if (!tools.length && !Object.keys(applied).length) return false;
  return { tools, applied };
}

/** Whether `oac sync` should ask: no decision yet, a terminal, and nobody said --yes. */
export function shouldAskTrim(manifest, flags = {}, { tty = Boolean(process.stdin.isTTY && process.stdout.isTTY), env = process.env } = {}) {
  if (manifest.trim !== undefined || flags.trim !== undefined) return false;
  return tty && !flags.yes && !flags.y && !isCI(env);
}

/**
 * The trim value `sync` should store: the flag when given, the answer when it
 * asks (once — only while the manifest has no `trim`), else unchanged.
 * `ask` resolves to an id list, or null when cancelled.
 */
export async function resolveSyncTrim(manifest, flags, { ask, tty, env } = {}) {
  const flag = parseTrimFlag(flags.trim);
  if (flag !== undefined) return trimFromChoice(flag, manifest.trim);
  if (!shouldAskTrim(manifest, flags, { tty, env })) return manifest.trim;
  const answer = await ask();
  return answer === null ? manifest.trim : trimFromChoice(answer, manifest.trim);
}

/** The installer for a tool on this platform, preferring the first whose tool is on PATH. */
export function installStep(tool, { platform = process.platform, env = process.env } = {}) {
  const steps = (tool.install || []).filter((s) => s.platforms.includes(platform));
  return steps.find((s) => !s.requires || onPath(s.requires, env)) || null;
}

/** oac targets this tool can be configured for. */
export function supportedTargets(tool, targets = []) {
  return targets.filter((t) => (tool.agents || []).includes(t));
}

/** The configure (or unconfigure) commands for a set of targets: [{ target, cmd }]. */
function commandsFor(map = {}, targets) {
  if (map['*']) return targets.length ? [{ target: '*', cmd: map['*'] }] : [];
  return targets.filter((t) => map[t]).map((t) => ({ target: t, cmd: map[t] }));
}

/** Run a catalog command through the shell. The commands are catalog constants. */
function sh(cmd, env, cwd) {
  const r = spawnSync(cmd, { shell: true, env, cwd: cwd || homeOf(env), encoding: 'utf8', timeout: TIMEOUT_MS });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Installed version ("1.0.1"), or null when the binary is missing or broken. */
export function toolVersion(tool, env = process.env) {
  if (!onPath(tool.bin, env)) return null;
  const r = sh(tool.version, env);
  if (!r.ok) return null;
  const m = r.out.match(/\d+\.\d+\.\d+[\w.-]*/);
  return m ? m[0] : r.out.trim().split('\n')[0] || 'unknown';
}

/** Whether the tool's own health check passes. */
export function verifyTool(tool, env = process.env) {
  return onPath(tool.bin, env) && sh(tool.verify, env).ok;
}

/**
 * Install (when missing), configure and verify every enabled tool, and undo any
 * that were applied but are no longer enabled. Mutates `manifest.trim.applied`.
 * Returns `{ changed, lines, warnings }`; silent when everything is in place.
 */
export function applyTrim(manifest, { flags = {}, env = process.env, platform = process.platform } = {}) {
  const res = { changed: false, lines: [], warnings: [] };
  try {
    const trim = manifest.trim;
    if (!trim || typeof trim !== 'object') return res;
    const tools = enabledTrim(manifest);
    const applied = (trim.applied = trim.applied || {});
    const stale = Object.keys(applied).filter((id) => !tools.includes(id));
    if (!tools.length && !stale.length) return res;

    const dry = Boolean(flags['dry-run']);
    if (isCI(env) && !dry) {
      res.lines.push(`Token saver skipped in CI (${[...tools, ...stale].join(', ')}).`);
      return res;
    }

    for (const id of stale) removeTrim(manifest, id, { flags, env, platform }, res);
    for (const id of tools) {
      const tool = getTrimTool(id);
      if (tool) applyOne(tool, manifest, { dry, env, platform }, res);
    }
    if (!tools.length && !Object.keys(applied).length) manifest.trim = false;
  } catch (err) {
    res.warnings.push(`token saver not applied: ${err.message}`);
  }
  return res;
}

function applyOne(tool, manifest, { dry, env, platform }, res) {
  const prev = manifest.trim.applied[tool.id];
  const targets = supportedTargets(tool, manifest.targets);
  if (!targets.length) {
    res.warnings.push(`${tool.id} supports none of this project's agents (${(manifest.targets || []).join(', ')}); nothing configured.`);
    return;
  }

  const missing = !onPath(tool.bin, env);
  const step = missing ? installStep(tool, { platform, env }) : null;
  if (missing && !step) {
    res.warnings.push(`${tool.id} is not installed and oac has no installer for ${platform} here; install it by hand (see "oac trim help ${tool.id}").`);
    return;
  }
  // Re-run configure for every target after a fresh install, else only for new ones.
  const pending = missing || !prev ? targets : targets.filter((t) => !(prev.targets || []).includes(t));
  const configure = commandsFor(tool.configure, pending);
  if (!missing && !configure.length) return;

  if (dry) {
    if (step) res.lines.push(`would run: ${step.run}`);
    for (const c of configure) res.lines.push(`would run: ${c.cmd}`);
    return;
  }

  if (step) {
    const r = sh(step.run, env);
    if (!r.ok || !onPath(tool.bin, env)) {
      res.warnings.push(`${tool.id} install failed; run by hand: ${step.run}`);
      return;
    }
    res.lines.push(`Installed ${tool.id} (${step.run})`);
  }

  const done = new Set(prev?.targets || []);
  for (const c of configure) {
    const r = sh(c.cmd, env);
    if (!r.ok) {
      res.warnings.push(`${tool.id} configure failed; run by hand: ${c.cmd}`);
      continue;
    }
    if (c.target === '*') pending.forEach((t) => done.add(t));
    else done.add(c.target);
  }
  if (!sh(tool.verify, env).ok) res.warnings.push(`${tool.id} check failed; run "${tool.verify}" to see why.`);

  const version = toolVersion(tool, env);
  manifest.trim.applied[tool.id] = {
    version,
    targets: targets.filter((t) => done.has(t)),
    installedWith: prev?.installedWith || step?.id || null,
  };
  res.changed = true;
  if (done.size) res.lines.push(`${tool.id}${version ? ` ${version}` : ''} configured for ${[...done].join(', ')}`);
}

/**
 * Undo one tool: its own uninstall per configured target, then the binary when
 * oac installed it. Drops it from `applied`. Appends to `res` (or a fresh one).
 */
export function removeTrim(manifest, id, { flags = {}, env = process.env } = {}, res = { changed: false, lines: [], warnings: [] }) {
  const tool = getTrimTool(id);
  const applied = (manifest.trim && manifest.trim.applied) || {};
  const prev = applied[id];
  if (!tool || !prev) {
    if (prev) delete applied[id];
    return res;
  }
  const cmds = commandsFor(tool.unconfigure, prev.targets || []).map((c) => c.cmd);
  const step = prev.installedWith && (tool.install || []).find((s) => s.id === prev.installedWith);
  if (step?.uninstall) cmds.push(step.uninstall);

  if (flags['dry-run']) {
    for (const c of cmds) res.lines.push(`would run: ${c}`);
    return res;
  }
  if (isCI(env)) {
    res.lines.push(`Token saver removal skipped in CI (${id}).`);
    return res;
  }
  for (const c of cmds) {
    if (!sh(c, env).ok) res.warnings.push(`${id} removal step failed; run by hand: ${c}`);
  }
  delete applied[id];
  res.changed = true;
  res.lines.push(`Removed ${id}${prev.targets?.length ? ` from ${prev.targets.join(', ')}` : ''}`);
  return res;
}

/** The first `max` meaningful lines of a tool's savings summary, or null on failure. */
export function savingsSummary(tool, env = process.env, max = 6) {
  if (!tool.status || !onPath(tool.bin, env)) return null;
  const r = spawnSync(tool.status, { shell: true, env, cwd: homeOf(env), encoding: 'utf8', timeout: 15_000 });
  // eslint-disable-next-line no-control-regex
  const text = `${r.stdout || ''}`.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  const lines = text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^[\s─━═=\-+|]+$/.test(l));
  // A degraded llmtrim exits non-zero but still prints its dashboard.
  if (!lines.length) return null;
  return lines.slice(0, max);
}

/** Read ~/.claude/settings.json hook entries as [{ event, matcher, command }]. */
function claudeHooks(env) {
  const file = path.join(homeOf(env), '.claude', 'settings.json');
  if (!exists(file)) return [];
  let data;
  try {
    data = JSON.parse(readText(file));
  } catch {
    return [];
  }
  const out = [];
  for (const [event, entries] of Object.entries(data?.hooks || {})) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      for (const h of e?.hooks || []) out.push({ event, matcher: e.matcher || '', command: String(h?.command || '') });
    }
  }
  return out;
}

const matchesBash = (matcher) => {
  if (!matcher || matcher === '*') return true;
  try {
    return new RegExp(`^(?:${matcher})$`).test('Bash');
  } catch {
    return matcher.includes('Bash');
  }
};

/**
 * Every token saver active for this user — the ones oac enabled plus the ones it
 * can spot cheaply in ~/.claude/settings.json — and the kinds more than one of
 * them claims. Two tools rewriting the same layer fight; different kinds are fine.
 */
export function detectOverlap(manifest, env = process.env) {
  const active = [];
  const add = (id, kind, source) => {
    if (!active.some((a) => a.id === id)) active.push({ id, kind, source });
  };
  for (const id of enabledTrim(manifest)) {
    const tool = getTrimTool(id);
    if (tool) add(id, tool.kind, 'oac');
  }
  for (const h of claudeHooks(env)) {
    if (/bash_rewriter_hook/.test(h.command) || (/tool_capture_hook/.test(h.command) && matchesBash(h.matcher))) {
      add('token-savior', 'shell-output', '~/.claude/settings.json');
    }
    if (/\brtk hook\b/.test(h.command)) add('rtk', 'shell-output', '~/.claude/settings.json');
  }
  const byKind = new Map();
  for (const a of active) byKind.set(a.kind, [...(byKind.get(a.kind) || []), a.id]);
  const conflicts = [...byKind].filter(([, ids]) => ids.length > 1).map(([kind, ids]) => ({ kind, ids }));
  return { active, conflicts };
}

/** One overlap warning per shared kind. */
export function overlapWarnings(manifest, env = process.env) {
  return detectOverlap(manifest, env).conflicts.map(
    ({ kind, ids }) => `Token savers overlap on ${kind}: ${ids.join(' + ')}. Keep one per layer (oac trim off <tool>, or remove the other's hook).`
  );
}
