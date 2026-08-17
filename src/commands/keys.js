import { resolveProjectDir } from '../fsutil.js';
import { readManifest } from '../manifest.js';
import { loadSkills } from '../catalog.js';
import { resolvePatterns, tableUnder } from '../patterns.js';

const unquote = (s) => s.replace(/`/g, '').trim();
const width = () => Math.max(60, Math.min(process.stdout.columns || 100, 110));

function truncate(s, max) {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** Two-column block: key left, meaning right, wrapped to the terminal. */
function printPairs(rows) {
  if (!rows.length) {
    console.log('    (none defined)');
    return;
  }
  const keys = rows.map((r) => unquote(r[0]));
  const pad = Math.min(Math.max(...keys.map((k) => k.length)), 22);
  const room = width() - pad - 8;
  rows.forEach(([, meaning], i) => {
    console.log(`    ${keys[i].padEnd(pad)}  ${truncate(meaning || '', room)}`);
  });
}

function heading(text) {
  console.log(`\n  ${text}`);
  console.log(`  ${'─'.repeat(Math.min(text.length + 2, width() - 4))}`);
}

export async function cmdKeys(ctx) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = readManifest(projectDir);
  const patterns = resolvePatterns(projectDir);

  console.log(`\n  ${manifest?.project?.name || 'Project'} — agent keys  (source: ${patterns.source})`);

  heading('Aliases — type the token alone; the agent expands it');
  printPairs(tableUnder(patterns.body, 'Aliases'));

  heading('Reference codes — "expand R2" instead of re-quoting');
  printPairs(tableUnder(patterns.body, 'Reference points'));

  // Skills are the project's slash commands in Claude Code.
  const selected = new Set(manifest?.skills || []);
  if (selected.size) {
    const skills = loadSkills().filter((s) => selected.has(s.id));
    heading('Skills — invoke by name or /slash');
    printPairs(skills.map((s) => [`/${s.id}`, s.description || s.name]));
  }

  const cmds = manifest?.project?.sections?.commands || {};
  const cmdRows = Object.entries(cmds).filter(([, v]) => v);
  if (cmdRows.length) {
    heading('Project commands');
    printPairs(cmdRows);
  }

  console.log(`\n  Edit these in .oac/communication-patterns.md, then run "oac sync".\n`);
}
