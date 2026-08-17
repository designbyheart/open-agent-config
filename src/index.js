import path from 'node:path';
import { readFileSync } from 'node:fs';

import { PKG_ROOT } from './paths.js';
import { cmdInit } from './commands/init.js';
import { cmdSync } from './commands/sync.js';
import { cmdList } from './commands/list.js';
import { cmdDoctor } from './commands/doctor.js';
import { cmdAddSkill, cmdRemoveSkill } from './commands/skill.js';
import { cmdImportSkill } from './commands/import.js';
import { cmdKeys } from './commands/keys.js';
import { cmdUpdate } from './commands/update.js';
import { cmdTelemetry } from './commands/telemetry.js';
import { track } from './telemetry.js';

export { PKG_ROOT };

/** Parse argv into { command, positionals, flags }. */
export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      flags[key] = rest.length ? rest.join('=') : true;
    } else if (arg.startsWith('-') && arg !== '-') {
      for (const ch of arg.slice(1)) flags[ch] = true;
    } else {
      positionals.push(arg);
    }
  }
  return { command: positionals[0], positionals: positionals.slice(1), flags };
}

/** Comma-separated flag → string[]. */
export function listFlag(value) {
  if (value === undefined || value === true) return undefined;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function version() {
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

const HELP = `
  open-agent-config (oac) — configure any AI agent/editor from one rules source

  Usage
    oac <command> [options]

  Commands
    init                 Interactive setup: pick agents/editors + skills, write configs
    sync                 Regenerate managed config blocks from the catalog + manifest
    list [skills|targets]  Show what the catalog offers
    import-skill <src>   Import a skill into the catalog from a path or git URL
    add-skill <name>     Add a catalog skill to this project
    remove-skill <name>  Remove a skill from this project
    doctor               Verify the project's config (drift, missing files, stale source)
    keys                 Print this project's aliases, reference codes, skills and commands
    update               Pull the latest oac itself (git checkout or npm install)
    telemetry [on|off]   Show or change anonymous usage counting (status by default)

  Options
    --dir=<path>         Target project directory (default: current directory)
    --targets=a,b,c      Agents/editors: claude,cursor,copilot,codex,windsurf
    --skills=a,b         Skill ids to install
    --stacks=a,b         Stack rule fragments: nextjs,react-native,swift-vapor
    --skills-only        Install skills + manifest only; never write/modify rule files
    --no-patterns        Don't scaffold .oac/communication-patterns.md (an existing one is still used)
    --check              update: report what's available without installing it
    --no-telemetry       Send no usage event for this run
    --yes, -y            Non-interactive; accept defaults / flag values
    --help, -h           Show this help
    --version, -v        Show version

  Examples
    npx open-agent-config init
    oac init --yes --targets=claude,cursor,codex
    oac sync
    oac list targets
    oac keys
    oac update --check
`;

export async function run(argv) {
  const { command, positionals, flags } = parseArgs(argv);

  if (flags.version || flags.v) {
    console.log(version());
    return;
  }
  if (!command || flags.help || flags.h || command === 'help') {
    console.log(HELP);
    return;
  }

  const ctx = { positionals, flags };

  // `telemetry` itself is never counted — asking about tracking should not be tracked.
  if (command === 'telemetry') return cmdTelemetry(ctx);

  const started = Date.now();
  let outcome = 'ok';
  let errorKind = null;
  try {
    return await dispatch(command, ctx);
  } catch (err) {
    outcome = 'error';
    // Class or code only. Messages routinely embed paths and project names.
    errorKind = err?.code || err?.constructor?.name || 'Error';
    throw err;
  } finally {
    await track(command, { outcome, error_kind: errorKind, duration_ms: Date.now() - started }, flags);
  }
}

async function dispatch(command, ctx) {
  switch (command) {
    case 'init':
      return cmdInit(ctx);
    case 'sync':
      return cmdSync(ctx);
    case 'list':
      return cmdList(ctx);
    case 'import-skill':
      return cmdImportSkill(ctx);
    case 'add-skill':
      return cmdAddSkill(ctx);
    case 'remove-skill':
      return cmdRemoveSkill(ctx);
    case 'doctor':
      return cmdDoctor(ctx);
    case 'keys':
      return cmdKeys(ctx);
    case 'update':
      return cmdUpdate(ctx);
    default:
      throw new Error(`Unknown command: ${command}\nRun "oac --help" for usage.`);
  }
}
