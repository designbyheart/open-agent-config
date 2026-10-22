import { resolveProjectDir } from '../fsutil.js';
import { readManifest, writeManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource } from '../catalog.js';
import { readProjectPatterns } from '../patterns.js';
import { applyManifest } from '../apply.js';
import { addContext } from '../telemetry.js';
import {
  trimCatalog,
  getTrimTool,
  enabledTrim,
  installStep,
  toolVersion,
  savingsSummary,
  applyTrim,
  removeTrim,
  trimFromChoice,
  overlapWarnings,
} from '../trim.js';

/**
 * `oac trim [status|help|on|off]` — the one place to see, explain, enable and
 * remove token savers, so nobody has to remember each tool's own commands.
 */
export async function cmdTrim(ctx) {
  const [action = 'status', id] = ctx.positionals;
  switch (action.toLowerCase()) {
    case 'status':
      return status(ctx);
    case 'help':
      return help(id);
    case 'on':
      return turnOn(ctx, id);
    case 'off':
      return turnOff(ctx, id);
    default:
      throw new Error(`Unknown trim action: ${action}. Use status, help, on or off.`);
  }
}

function toolOrThrow(id) {
  const tool = id && getTrimTool(id);
  if (!tool) {
    const ids = trimCatalog().map((t) => t.id).join(', ');
    throw new Error(id ? `Unknown token saver "${id}". Available: ${ids}.` : `Name a token saver: ${ids}.`);
  }
  return tool;
}

function manifestOrThrow(projectDir) {
  const manifest = readManifest(projectDir);
  if (!manifest) throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);
  return manifest;
}

/** Regenerate configs (rtk's rules follow the enabled set) and refresh the hash. */
function regenerate(projectDir, manifest) {
  applyManifest(projectDir, manifest);
  manifest.sourceHash = hashSource({
    stacks: manifest.stacks,
    skills: manifest.skills,
    ollama: manifest.ollama,
    patterns: readProjectPatterns(projectDir)?.body,
    trim: manifest.trim,
  });
  writeManifest(projectDir, manifest);
}

function report(res) {
  for (const l of res.lines) console.log(`  ✔ ${l}`);
  for (const w of res.warnings) console.log(`  ⚠ ${w}`);
}

function status(ctx) {
  const manifest = readManifest(resolveProjectDir(ctx.flags)) || {};
  const enabled = enabledTrim(manifest);
  addContext({ trim: enabled });
  console.log(`\n  Token savers${manifest.trim === undefined ? ' (not decided for this project yet)' : ''}`);
  for (const tool of trimCatalog()) {
    const version = toolVersion(tool);
    const on = enabled.includes(tool.id);
    const targets = manifest.trim?.applied?.[tool.id]?.targets || [];
    const state = on ? 'on' : 'off';
    const installed = version ? `installed ${version}` : 'not installed';
    console.log(`\n  ${tool.name} — ${state}, ${installed}${targets.length ? `, configured for ${targets.join(', ')}` : ''}`);
    console.log(`    ${tool.kind}: ${tool.hint}`);
    if (!version) {
      if (!on) console.log(`    Enable: oac trim on ${tool.id}`);
      continue;
    }
    const summary = savingsSummary(tool);
    if (summary) for (const l of summary) console.log(`    │ ${l}`);
    else console.log(`    (no savings summary; "${tool.status}" failed)`);
  }
  for (const w of overlapWarnings(manifest)) console.log(`\n  ⚠ ${w}`);
  console.log(`\n  More: oac trim help [${trimCatalog().map((t) => t.id).join('|')}]\n`);
}

function help(id) {
  if (!id) {
    console.log('\n  Token savers cut what your agent reads. Opt-in; one per layer.\n');
    for (const tool of trimCatalog()) {
      console.log(`  ${tool.name.padEnd(9)} ${tool.kind.padEnd(16)} ${tool.hint}`);
    }
    console.log('\n  oac trim help <tool>     what it does, when it helps, its commands');
    console.log('  oac trim on <tool>       install and configure it for this project\'s agents');
    console.log('  oac trim off [tool]      undo it (all tools when none is named)');
    console.log('  oac trim [status]        what is on, installed, configured, and saved\n');
    console.log('  Savings vary and the tools\' own counters are not your bill; compare costs yourself.\n');
    return;
  }
  const tool = toolOrThrow(id);
  const step = installStep(tool);
  const configure = Object.entries(tool.configure).map(([t, c]) => (t === '*' ? c : `${c}   (${t})`));
  console.log(`\n  ${tool.name} — ${tool.homepage}\n`);
  console.log(`  What it trims   ${tool.trims}`);
  console.log(`  When it helps   ${tool.helps}`);
  console.log(`  Watch out       ${tool.caveats}`);
  console.log(`  Agents          ${tool.agents.join(', ')}`);
  console.log('\n  Commands');
  const width = Math.max(...tool.commands.map((c) => c.cmd.length));
  for (const c of tool.commands) console.log(`    ${c.cmd.padEnd(width)}  ${c.desc}`);
  console.log('\n  What oac runs');
  console.log(`    install     ${step ? step.run : `(no installer for ${process.platform}; see ${tool.homepage})`}`);
  for (const c of configure) console.log(`    configure   ${c}`);
  console.log(`    verify      ${tool.verify}`);
  console.log(`    undo        oac trim off ${tool.id}\n`);
}

async function turnOn(ctx, id) {
  const tool = toolOrThrow(id);
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = manifestOrThrow(projectDir);
  const tools = [...new Set([...enabledTrim(manifest), tool.id])];
  manifest.trim = trimFromChoice(tools, manifest.trim);
  regenerate(projectDir, manifest);
  const res = applyTrim(manifest, { flags: ctx.flags });
  writeManifest(projectDir, manifest);
  addContext({ trim: enabledTrim(manifest) });
  console.log(`\n  ✔ ${tool.name} enabled for ${manifest.project?.name || 'this project'}`);
  report(res);
  console.log(`  See savings with: oac trim status\n`);
}

async function turnOff(ctx, id) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = manifestOrThrow(projectDir);
  const ids = id ? [toolOrThrow(id).id] : enabledTrim(manifest).concat(Object.keys(manifest.trim?.applied || {}));
  const res = { changed: false, lines: [], warnings: [] };
  for (const t of new Set(ids)) removeTrim(manifest, t, { flags: ctx.flags }, res);
  if (!ctx.flags['dry-run']) {
    const remaining = enabledTrim(manifest).filter((t) => !ids.includes(t));
    manifest.trim = trimFromChoice(remaining, manifest.trim);
    // Anything not undone (skipped in CI) stays in `applied` for a later sync to finish.
    regenerate(projectDir, manifest);
  }
  addContext({ trim: enabledTrim(manifest) });
  console.log(`\n  ✔ Token saver${id ? ` ${id}` : 's'} off`);
  report(res);
  console.log('');
}
