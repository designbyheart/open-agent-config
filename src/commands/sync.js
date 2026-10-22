import path from 'node:path';
import { readFileSync } from 'node:fs';
import { PKG_ROOT } from '../paths.js';
import { resolveProjectDir } from '../fsutil.js';
import { readManifest, writeManifest, MANIFEST_NAME } from '../manifest.js';
import { hashSource } from '../catalog.js';
import { readProjectPatterns } from '../patterns.js';
import { addContext } from '../telemetry.js';
import { installGraphHook } from '../graphHook.js';
import { applyTrim, resolveSyncTrim, trimCatalog, enabledTrim } from '../trim.js';
import { applyManifest } from '../apply.js';

export async function cmdSync(ctx) {
  const projectDir = resolveProjectDir(ctx.flags);
  const manifest = readManifest(projectDir);
  if (!manifest) {
    throw new Error(`No ${MANIFEST_NAME} here. Run "oac init" first.`);
  }

  // Opting out on sync sticks, the same as on init.
  if (ctx.flags['no-graph-hook']) manifest.graphHook = false;

  // Token saver: --trim wins; otherwise a project that never answered is asked once.
  const trimChoice = await resolveSyncTrim(manifest, ctx.flags, {
    ask: async () => (await import('../prompts.js')).askTrim(trimCatalog(), manifest.trim),
  });
  if (trimChoice === undefined) delete manifest.trim;
  else manifest.trim = trimChoice;

  // Regenerate first — apply may scaffold the project patterns file, whose
  // content feeds the source hash — then refresh derived fields.
  const warnings = [];
  const written = applyManifest(projectDir, manifest, { onWarn: (w) => warnings.push(w) });
  manifest.sourceHash = hashSource({
    stacks: manifest.stacks,
    skills: manifest.skills,
    ollama: manifest.ollama,
    patterns: readProjectPatterns(projectDir)?.body,
    trim: manifest.trim,
  });
  manifest.cliVersion = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
  manifest.generatedAt = new Date().toISOString();
  writeManifest(projectDir, manifest);

  // Re-run on every sync: this is how an upgraded refresh script reaches the hooks dir.
  const graph = installGraphHook(projectDir, manifest, { flags: ctx.flags });
  // Silent unless something was installed, configured or undone.
  const trim = applyTrim(manifest, { flags: ctx.flags });
  if (trim.changed) writeManifest(projectDir, manifest);

  addContext({
    targets: manifest.targets,
    stacks: manifest.stacks,
    skill_count: (manifest.skills || []).length,
    patterns: manifest.patterns !== false,
    graph_hook: graph.mode,
    trim: enabledTrim(manifest),
  });

  console.log(`\n  ✔ Synced ${manifest.project.name} (${manifest.targets.join(', ')})`);
  console.log(`  ✔ ${written.length} path(s) regenerated.`);
  for (const l of [...graph.lines, ...trim.lines]) console.log(`  ✔ ${l}`);
  for (const w of [...warnings, ...graph.warnings, ...trim.warnings]) console.log(`  ⚠ ${w}`);
  console.log('');
}
