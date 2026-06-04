import path from 'node:path';
import { readFileSync } from 'node:fs';
import { PKG_ROOT } from '../paths.js';
import { listFlag } from '../index.js';
import { resolveProjectDir } from '../fsutil.js';
import { readManifest, makeManifest, writeManifest } from '../manifest.js';
import { hashSource, loadTargets, loadSkills, loadStacks, loadOllamaApps } from '../catalog.js';
import { isKnownTarget } from '../targets/registry.js';

const DEFAULT_OLLAMA_MODELS = ['kimi-k2.6:cloud', 'gemma4:cloud', 'minimax3:cloud'];
import { applyManifest } from '../apply.js';

function cliVersion() {
  return JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
}

/** Build a manifest from explicit flags + existing manifest defaults (non-interactive). */
function manifestFromFlags(projectDir, flags, existing) {
  const skillsOnly = Boolean(flags['skills-only'] || existing?.skillsOnly);
  const defaultTargets = skillsOnly ? ['claude'] : ['claude', 'codex'];
  const targets = listFlag(flags.targets) || existing?.targets || defaultTargets;
  const unknown = targets.filter((t) => !isKnownTarget(t));
  if (unknown.length) throw new Error(`Unknown target(s): ${unknown.join(', ')}`);

  const skills = listFlag(flags.skills) || existing?.skills || [];
  const stacks = listFlag(flags.stacks) || existing?.stacks || [];
  const name = (typeof flags.name === 'string' && flags.name) || existing?.project?.name || path.basename(projectDir);

  // Ollama: only meaningful when the ollama target is selected.
  let ollama = { models: [], apps: [] };
  if (targets.includes('ollama')) {
    ollama = {
      models: listFlag(flags['ollama-models']) || existing?.ollama?.models || DEFAULT_OLLAMA_MODELS,
      apps: existing?.ollama?.apps?.length ? existing.ollama.apps : loadOllamaApps().map((a) => a.id),
    };
  }

  return makeManifest({
    project: {
      name,
      description: existing?.project?.description || '',
      sections: existing?.project?.sections || {},
    },
    targets,
    skills,
    stacks,
    ollama,
    skillsOnly,
    sourceHash: hashSource({ stacks, skills, ollama }),
    cliVersion: cliVersion(),
  });
}

export async function cmdInit(ctx) {
  const { flags } = ctx;
  const projectDir = resolveProjectDir(flags);
  const existing = readManifest(projectDir);

  let manifest;
  if (flags.yes || flags.y) {
    manifest = manifestFromFlags(projectDir, flags, existing);
  } else {
    const { interactiveSetup } = await import('../prompts.js');
    const selections = await interactiveSetup({
      projectDir,
      existing,
      targets: loadTargets(),
      skills: loadSkills(),
      stacks: loadStacks(),
      ollamaApps: loadOllamaApps(),
      defaultOllamaModels: DEFAULT_OLLAMA_MODELS,
    });
    if (!selections) return; // user cancelled
    manifest = makeManifest({
      project: selections.project,
      targets: selections.targets,
      skills: selections.skills,
      stacks: selections.stacks,
      ollama: selections.ollama,
      sourceHash: hashSource({ stacks: selections.stacks, skills: selections.skills, ollama: selections.ollama }),
      cliVersion: cliVersion(),
    });
  }

  writeManifest(projectDir, manifest);
  const written = applyManifest(projectDir, manifest);

  if (manifest.skillsOnly) {
    console.log(`\n  ✔ ${manifest.project.name}: skills-only mode (existing rule files left untouched)`);
  } else {
    console.log(`\n  ✔ Configured ${manifest.project.name} for: ${manifest.targets.join(', ')}`);
  }
  console.log(`  ✔ Wrote ${written.length} path(s):`);
  for (const w of written) console.log(`      ${w}`);
  console.log(`\n  Manifest: orby-agent.config.json`);
  console.log(`  Re-run after catalog updates with:  oac sync\n`);
}
