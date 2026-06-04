import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SKILLS_DIR, parseFrontmatter } from '../catalog.js';
import { exists, readText, copyDir, rmrf, listDirs } from '../fsutil.js';

// Terms that usually mean a skill is tied to a specific org/repo and should be
// genericized before sharing across projects.
const PROJECT_SPECIFIC = /tobii|pdk|artifactory|bazel|clang-format|request_user_input|\bmaster\b/i;

function isGitUrl(s) {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(s) || s.endsWith('.git');
}

/** Resolve the source to a local directory; clone first if it's a git URL. */
function resolveSource(source, flags) {
  if (isGitUrl(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-import-'));
    console.log(`  • Cloning ${source} …`);
    execFileSync('git', ['clone', '--depth', '1', source, tmp], { stdio: 'ignore' });
    return { root: flags.from ? path.join(tmp, String(flags.from)) : tmp, cleanup: () => rmrf(tmp) };
  }
  const abs = path.resolve(source);
  if (!exists(abs)) throw new Error(`Source not found: ${abs}`);
  return { root: flags.from ? path.join(abs, String(flags.from)) : abs, cleanup: () => {} };
}

/** A skill dir contains SKILL.md. Return the skills found under root. */
function findSkills(root, flags) {
  if (exists(path.join(root, 'SKILL.md'))) {
    return [{ id: flags.name ? String(flags.name) : path.basename(root), dir: root }];
  }
  const found = listDirs(root)
    .filter((d) => exists(path.join(root, d, 'SKILL.md')))
    .map((d) => ({ id: d, dir: path.join(root, d) }));
  if (!found.length) {
    throw new Error(`No SKILL.md found at ${root} (nor in its immediate subfolders). Use --from=<subpath> if needed.`);
  }
  if (!flags.all && found.length > 1) {
    const names = found.map((f) => f.id).join(', ');
    throw new Error(`Found ${found.length} skills (${names}). Re-run with --all to import all, or point at one folder.`);
  }
  return found;
}

function warnIfProjectSpecific(skillDir, id) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(md|json|ya?ml|py|sh|txt)$/i.test(entry.name) && PROJECT_SPECIFIC.test(readText(p))) {
        hits.push(path.relative(skillDir, p));
      }
    }
  };
  walk(skillDir);
  if (hits.length) {
    console.log(`    ⚠ ${id}: project-specific terms found in ${hits.length} file(s): ${hits.join(', ')}`);
    console.log(`      Review/genericize before sharing across projects.`);
  }
}

export async function cmdImportSkill(ctx) {
  const source = ctx.positionals[0];
  if (!source) throw new Error('Usage: oac import-skill <path|git-url> [--name=<id>] [--from=<subpath>] [--all] [--force]');

  const { root, cleanup } = resolveSource(source, ctx.flags);
  try {
    const skills = findSkills(root, ctx.flags);
    const imported = [];

    for (const skill of skills) {
      // Validate metadata.
      const { data } = parseFrontmatter(readText(path.join(skill.dir, 'SKILL.md')));
      const hasJson = exists(path.join(skill.dir, 'skill.json'));
      if (!data.name && !data.description && !hasJson) {
        console.log(`    ⚠ ${skill.id}: SKILL.md has no name/description frontmatter and no skill.json.`);
      }

      const dest = path.join(SKILLS_DIR, skill.id);
      if (exists(dest) && !ctx.flags.force) {
        throw new Error(`Skill "${skill.id}" already exists in the catalog. Use --force to overwrite.`);
      }
      if (exists(dest)) rmrf(dest);
      copyDir(skill.dir, dest);
      warnIfProjectSpecific(dest, skill.id);
      imported.push(skill.id);
    }

    console.log(`\n  ✔ Imported ${imported.length} skill(s) into the catalog: ${imported.join(', ')}`);
    console.log(`    Confirm with:  oac list skills`);
    console.log(`    Install into a project:  oac add-skill ${imported[0]} --dir=<project>\n`);
  } finally {
    cleanup();
  }
}
