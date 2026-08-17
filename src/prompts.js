import path from 'node:path';
import * as p from '@clack/prompts';

/**
 * Interactive setup wizard. Returns selections or null if cancelled.
 * Lazily imported so non-interactive `--yes` runs don't require @clack/prompts.
 */
export async function interactiveSetup({
  projectDir,
  existing,
  targets,
  skills,
  stacks,
  ollamaApps = [],
  defaultOllamaModels = [],
}) {
  p.intro('open-agent-config — configure this project');

  const cancelled = (v) => p.isCancel(v);

  const name = await p.text({
    message: 'Project name',
    placeholder: path.basename(projectDir),
    initialValue: existing?.project?.name || path.basename(projectDir),
  });
  if (cancelled(name)) return cancel();

  const description = await p.text({
    message: 'One-line description (optional)',
    initialValue: existing?.project?.description || '',
  });
  if (cancelled(description)) return cancel();

  const selectedTargets = await p.multiselect({
    message: 'Which agents / editors do you use?',
    options: targets.map((t) => ({ value: t.id, label: t.label })),
    initialValues: existing?.targets || ['claude', 'codex'],
    required: true,
  });
  if (cancelled(selectedTargets)) return cancel();

  let selectedStacks = existing?.stacks || [];
  if (stacks.length) {
    selectedStacks = await p.multiselect({
      message: 'Project stack(s) — adds stack-specific rules (optional)',
      options: stacks.map((s) => ({ value: s.id, label: s.label })),
      initialValues: existing?.stacks || [],
      required: false,
    });
    if (cancelled(selectedStacks)) return cancel();
  }

  const installableSkills = skills.filter((s) => s.id !== '_example');
  const ALL_SKILLS = '*';
  let selectedSkills = existing?.skills || [];
  if (installableSkills.length) {
    selectedSkills = await p.multiselect({
      message: 'Skills to install (optional)',
      options: [
        { value: ALL_SKILLS, label: 'All Skills', hint: `install all ${installableSkills.length} skills in the catalog` },
        ...installableSkills.map((s) => ({ value: s.id, label: s.name, hint: s.description })),
      ],
      initialValues: existing?.skills || [],
      required: false,
    });
    if (cancelled(selectedSkills)) return cancel();
    if (selectedSkills.includes(ALL_SKILLS)) {
      selectedSkills = installableSkills.map((s) => s.id);
    }
  }

  // Ollama models — only when the ollama target is selected.
  let ollama = { models: [], apps: [] };
  if (selectedTargets.includes('ollama')) {
    const initial = (existing?.ollama?.models?.length ? existing.ollama.models : defaultOllamaModels).join(', ');
    const modelsRaw = await p.text({
      message: 'Ollama model tags (comma-separated) — e.g. kimi-k2.6:cloud',
      initialValue: initial,
      placeholder: initial,
    });
    if (cancelled(modelsRaw)) return cancel();
    ollama = {
      models: String(modelsRaw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      apps: existing?.ollama?.apps?.length ? existing.ollama.apps : ollamaApps.map((a) => a.id),
    };
  }

  // Project-owned communication patterns. Scaffolded once, then tuned by hand;
  // an existing file is never overwritten, so this only matters on first run.
  const patterns = await p.confirm({
    message: 'Scaffold a tunable communication-patterns file for this project?',
    initialValue: existing?.patterns ?? true,
  });
  if (cancelled(patterns)) return cancel();
  if (patterns) {
    p.note(
      'Prefilled with banned phrases, house style, reference-point codes (D1/R1/F1…),\n' +
        'aliases (scr, eli, focus, ref…), project boundaries (commit policy,\n' +
        'off-limits paths), domain vocabulary and example slots.\n' +
        'Edit it, then run "oac sync".',
      '.oac/communication-patterns.md'
    );
  }

  p.outro('Generating config…');

  return {
    project: {
      name: name || path.basename(projectDir),
      description: description || '',
      sections: existing?.project?.sections || {},
    },
    targets: selectedTargets,
    stacks: selectedStacks,
    skills: selectedSkills,
    ollama,
    patterns,
  };

  function cancel() {
    p.cancel('Cancelled — no changes made.');
    return null;
  }
}
