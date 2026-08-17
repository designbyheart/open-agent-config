import path from 'node:path';
import { resolveProjectDir, exists, rmrf } from '../fsutil.js';
import { readManifest, writeManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource, loadSkills } from '../catalog.js';
import { readProjectPatterns } from '../patterns.js';
import { applyManifest } from '../apply.js';

function loadOrThrow(projectDir) {
  const manifest = readManifest(projectDir);
  if (!manifest) throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);
  return manifest;
}

export async function cmdAddSkill(ctx) {
  const id = ctx.positionals[0];
  if (!id) throw new Error('Usage: oac add-skill <name>');
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = loadOrThrow(projectDir);

  const known = new Set(loadSkills().map((s) => s.id));
  if (!known.has(id)) throw new Error(`No catalog skill "${id}". See "oac list skills".`);
  if (manifest.skills.includes(id)) {
    console.log(`\n  • ${id} is already installed.\n`);
    return;
  }

  manifest.skills.push(id);
  manifest.sourceHash = hashSource({
    stacks: manifest.stacks,
    skills: manifest.skills,
    ollama: manifest.ollama,
    patterns: readProjectPatterns(projectDir)?.body,
  });
  writeManifest(projectDir, manifest);
  applyManifest(projectDir, manifest);
  console.log(`\n  ✔ Added skill "${id}".\n`);
}

export async function cmdRemoveSkill(ctx) {
  const id = ctx.positionals[0];
  if (!id) throw new Error('Usage: oac remove-skill <name>');
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = loadOrThrow(projectDir);

  if (!manifest.skills.includes(id)) {
    console.log(`\n  • ${id} is not installed.\n`);
    return;
  }

  manifest.skills = manifest.skills.filter((s) => s !== id);
  manifest.sourceHash = hashSource({
    stacks: manifest.stacks,
    skills: manifest.skills,
    ollama: manifest.ollama,
    patterns: readProjectPatterns(projectDir)?.body,
  });
  writeManifest(projectDir, manifest);

  // Remove the physically installed skill folder, if present.
  const installed = path.join(projectDir, '.claude', 'skills', id);
  if (exists(installed)) rmrf(installed);

  applyManifest(projectDir, manifest);
  console.log(`\n  ✔ Removed skill "${id}".\n`);
}
