import { loadOllamaApps } from '../catalog.js';

/** Filesystem-safe slug for a model tag, e.g. "kimi-k2.6:cloud" → "kimi-k2.6-cloud". */
export function modelSlug(model) {
  return model.replace(/[:/\\]/g, '-');
}

function shScript(app, model) {
  // Runs from the project root (two levels up) so the harness finds the config.
  return [
    '#!/usr/bin/env bash',
    'set -e',
    'cd "$(dirname "$0")/../.."',
    `exec ollama launch ${app} --model ${model} "$@"`,
    '',
  ].join('\n');
}

function ps1Script(app, model) {
  return [
    '#!/usr/bin/env pwsh',
    "Set-Location (Join-Path $PSScriptRoot '..\\..')",
    `ollama launch ${app} --model ${model} @args`,
    '',
  ].join('\n');
}

export default {
  id: 'ollama',
  label: 'Ollama (run models via local/cloud harnesses)',
  supportsSkills: false,
  detect: ['.oac/ollama'],
  // Ollama is not a rules-file consumer — `ollama launch <app> --model <tag>`
  // starts an existing harness (Claude Code, Codex, …) that reads the rules
  // files oac already generates. This target emits launch commands + scripts.
  render({ projectName, manifest }) {
    const models = manifest.ollama?.models || [];
    if (!models.length) return [];

    const catalog = loadOllamaApps();
    const appIds = manifest.ollama?.apps?.length ? manifest.ollama.apps : catalog.map((a) => a.id);
    const apps = catalog.filter((a) => appIds.includes(a.id));

    const artifacts = [];

    // Cheat sheet
    const rows = [];
    for (const app of apps) {
      for (const model of models) {
        rows.push(
          `| ${app.label} (\`${app.id}\`) | \`${model}\` | \`${app.reads}\` | \`ollama launch ${app.id} --model ${model}\` |`
        );
      }
    }
    const launchMd = [
      `# Ollama launch cheat sheet — ${projectName}`,
      '',
      'Run any of these **from the project root** so the harness picks up the generated',
      'rules files (`CLAUDE.md`, `AGENTS.md`, …). Or use the scripts in this folder.',
      '',
      '| App | Model | Reads | Command |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
      '## Scripts',
      '',
      '- macOS / Linux: `./.oac/ollama/<app>--<model>.sh`',
      '- Windows (PowerShell): `./.oac/ollama/<app>--<model>.ps1`',
      '',
      'Each script `cd`s to the project root and runs the matching `ollama launch` command.',
      '',
    ].join('\n');
    artifacts.push({ path: '.oac/ollama/LAUNCH.md', type: 'raw', content: launchMd });

    // Runnable launchers (.sh executable + .ps1) per app × model
    for (const app of apps) {
      for (const model of models) {
        const base = `.oac/ollama/${app.id}--${modelSlug(model)}`;
        artifacts.push({ path: `${base}.sh`, type: 'raw', content: shScript(app.id, model), mode: 0o755 });
        artifacts.push({ path: `${base}.ps1`, type: 'raw', content: ps1Script(app.id, model) });
      }
    }

    return artifacts;
  },
};
