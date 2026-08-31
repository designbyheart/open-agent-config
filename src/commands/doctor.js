import path from 'node:path';
import { resolveProjectDir, exists, readText } from '../fsutil.js';
import { readManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource } from '../catalog.js';
import { readProjectPatterns, PATTERNS_REL } from '../patterns.js';
import { buildArtifacts } from '../targets/registry.js';
import { hasBlock } from '../managed.js';

export async function cmdDoctor(ctx) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = readManifest(projectDir);
  if (!manifest) throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);

  const problems = [];
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
  const { artifacts, doc, skillTargets, warnings } = buildArtifacts(manifest, { projectDir });
  if (manifest.skillsOnly) {
    ok.push('Skills-only mode — rule files are managed outside oac.');
  } else {
    for (const a of artifacts) {
      const abs = path.join(projectDir, a.path);
      if (!exists(abs)) {
        problems.push(`Missing file: ${a.path}`);
        continue;
      }
      if (a.type === 'doc' && !hasBlock(readText(abs))) {
        problems.push(`Managed block missing in: ${a.path}`);
      } else {
        ok.push(`Present: ${a.path}`);
      }
    }
  }

  // 3. Installed skills present, in every target that loads them natively.
  const skillDirs = skillTargets.map((t) => t.skillsDir);
  if (manifest.skillsOnly && !skillDirs.length) skillDirs.push('.claude/skills');
  for (const rel of skillDirs) {
    for (const skill of doc.selectedSkills) {
      const dir = path.join(projectDir, ...rel.split('/'), skill.id);
      if (!exists(dir)) problems.push(`Skill not installed: ${rel}/${skill.id}/`);
      else ok.push(`Skill installed: ${rel}/${skill.id}`);
    }
  }

  // 4. Generated docs that their consumer will silently truncate.
  for (const w of warnings) problems.push(w);

  console.log(`\n  Doctor — ${manifest.project.name}`);
  for (const o of ok) console.log(`    ✔ ${o}`);
  for (const pr of problems) console.log(`    ✖ ${pr}`);

  if (problems.length) {
    console.log(`\n  ${problems.length} problem(s). Run "oac sync" to fix generated files.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  All good.\n`);
  }
}
