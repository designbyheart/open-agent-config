import path from 'node:path';
import { readFileSync } from 'node:fs';
import { PKG_ROOT } from '../paths.js';
import { resolveProjectDir } from '../fsutil.js';
import { readManifest, writeManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource } from '../catalog.js';
import { readProjectPatterns } from '../patterns.js';
import { addContext } from '../telemetry.js';
import { applyManifest } from '../apply.js';

export async function cmdSync(ctx) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = readManifest(projectDir);
  if (!manifest) {
    throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);
  }

  // Regenerate first — apply may scaffold the project patterns file, whose
  // content feeds the source hash — then refresh derived fields.
  const written = applyManifest(projectDir, manifest);
  manifest.sourceHash = hashSource({
    stacks: manifest.stacks,
    skills: manifest.skills,
    ollama: manifest.ollama,
    patterns: readProjectPatterns(projectDir)?.body,
  });
  manifest.cliVersion = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
  manifest.generatedAt = new Date().toISOString();
  writeManifest(projectDir, manifest);

  addContext({
    targets: manifest.targets,
    stacks: manifest.stacks,
    skill_count: (manifest.skills || []).length,
    patterns: manifest.patterns !== false,
  });

  console.log(`\n  ✔ Synced ${manifest.project.name} (${manifest.targets.join(', ')})`);
  console.log(`  ✔ ${written.length} path(s) regenerated.\n`);
}
