import path from 'node:path';
import { resolveProjectDir, exists, readText, listDirs } from '../fsutil.js';
import { readManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource, loadSkills } from '../catalog.js';
import { docBytes } from '../generate.js';
import { readProjectPatterns, PATTERNS_REL } from '../patterns.js';
import { buildArtifacts, skillDirsFor, budgetWarning } from '../targets/registry.js';
import { hasBlock } from '../managed.js';

export async function cmdDoctor(ctx) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = readManifest(projectDir);
  if (!manifest) throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);

  const problems = [];
  const warnings = [];
  const ok = [];

  // 1. Source drift.
  const current = hashSource({
    stacks: manifest.stacks,
    skills: manifest.skills,
    ollama: manifest.ollama,
    patterns: readProjectPatterns(projectDir)?.body,
  });
  if (manifest.sourceHash && manifest.sourceHash !== current) {
    problems.push(
      `Catalog or ${PATTERNS_REL} changed since last generation (run "oac sync"). [${manifest.sourceHash} → ${current}]`
    );
  } else {
    ok.push('Source up to date with catalog.');
  }

  // 2. Expected files present + managed block intact (skipped in skills-only mode).
  const { artifacts, doc } = buildArtifacts(manifest, { projectDir });
  if (manifest.skillsOnly) {
    ok.push('Skills-only mode — rule files are managed outside oac.');
  } else {
    for (const a of artifacts) {
      const abs = path.join(projectDir, a.path);
      if (!exists(abs)) {
        problems.push(`Missing file: ${a.path}`);
        continue;
      }
      const text = readText(abs);
      if (a.type === 'doc' && !hasBlock(text)) {
        problems.push(`Managed block missing in: ${a.path}`);
      } else {
        ok.push(`Present: ${a.path} (${(docBytes(text) / 1024).toFixed(1)} KiB)`);
      }
      // Size the file as it sits on disk — hand-written content above the
      // managed block counts against the consumer's budget just the same.
      if (a.budgeted) {
        const w = budgetWarning(a.path, docBytes(text));
        if (w) warnings.push(w);
      }
    }
  }

  // 3. Installed skills present, in every target that loads them natively, and
  //    no leftovers from catalog skills that were deselected.
  const selected = new Set(doc.selectedSkills.map((s) => s.id));
  // Only folders oac could have put there are its business. `.claude/skills/`
  // is also where people keep their own hand-written skills, and flagging
  // those would make doctor permanently red over files it must not touch.
  const catalogIds = new Set(loadSkills().map((s) => s.id));
  for (const rel of skillDirsFor(manifest)) {
    for (const skill of doc.selectedSkills) {
      const dir = path.join(projectDir, ...rel.split('/'), skill.id);
      if (!exists(dir)) problems.push(`Skill not installed: ${rel}/${skill.id}/`);
      else ok.push(`Skill installed: ${rel}/${skill.id}`);
    }
    const root = path.join(projectDir, ...rel.split('/'));
    if (!exists(root)) continue;
    for (const name of listDirs(root)) {
      if (catalogIds.has(name) && !selected.has(name)) {
        problems.push(`Deselected catalog skill still installed: ${rel}/${name}/ (remove it by hand)`);
      }
    }
  }

  console.log(`\n  Doctor — ${manifest.project.name}`);
  for (const o of ok) console.log(`    ✔ ${o}`);
  for (const pr of problems) console.log(`    ✖ ${pr}`);
  for (const w of warnings) console.log(`    ⚠ ${w}`);

  if (problems.length) {
    console.log(`\n  ${problems.length} problem(s). Run "oac sync" to fix generated files.`);
    process.exitCode = 1;
  } else if (!warnings.length) {
    console.log(`\n  All good.\n`);
    return;
  }
  // Oversize is real but "sync" cannot shrink a rule set, so it gets its own
  // advice rather than pointing at a command that will never clear it.
  if (warnings.length) {
    console.log(
      `\n  ${warnings.length} oversize file(s). Their tails are ignored by the tools that read them; ` +
        `select fewer skills, trim rules, or move skills to a target that installs them.`
    );
    process.exitCode = 1;
  }
  console.log('');
}
