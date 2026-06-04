import path from 'node:path';
import { readFileSync } from 'node:fs';
import { PKG_ROOT } from '../paths.js';
import { resolveProjectDir } from '../fsutil.js';
import { readManifest, writeManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource } from '../catalog.js';
import { applyManifest } from '../apply.js';

export async function cmdSync(ctx) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = readManifest(projectDir);
  if (!manifest) {
    throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);
  }

  // Refresh derived fields, then regenerate.
  manifest.sourceHash = hashSource({ stacks: manifest.stacks, skills: manifest.skills, ollama: manifest.ollama });
  manifest.cliVersion = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
  manifest.generatedAt = new Date().toISOString();

  writeManifest(projectDir, manifest);
  const written = applyManifest(projectDir, manifest);

  console.log(`\n  ✔ Synced ${manifest.project.name} (${manifest.targets.join(', ')})`);
  console.log(`  ✔ ${written.length} path(s) regenerated.\n`);
}
