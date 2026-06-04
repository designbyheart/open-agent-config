import { loadRules, loadStacks, loadSkills } from './catalog.js';

/** Strip a single leading `# H1` line from a fragment body. */
function stripH1(body) {
  return body.replace(/^#\s+.*\n+/, '').trim();
}

/**
 * Assemble the canonical instruction document from the manifest. Every target
 * renders from THIS so the rules are identical across tools — only the wrapper
 * (frontmatter, filename, skills handling) differs per target.
 */
export function assemble(manifest) {
  const projectName = manifest.project?.name || 'Project';
  const description = manifest.project?.description || '';
  const sections = [];

  // Project overview (optional)
  if (description || manifest.project?.sections?.overview) {
    const overview = manifest.project?.sections?.overview;
    sections.push({
      title: `Project: ${projectName}`,
      md: [description, overview].filter(Boolean).join('\n\n'),
    });
  }

  // Base rule fragments, in catalog order, demoted to H2 sections.
  for (const rule of loadRules()) {
    sections.push({ title: rule.title, md: `## ${rule.title}\n\n${stripH1(rule.body)}` });
  }

  // Selected stack fragments (already authored as H2).
  const stackById = new Map(loadStacks().map((s) => [s.id, s]));
  for (const id of manifest.stacks || []) {
    const stack = stackById.get(id);
    if (stack) sections.push({ title: stack.label, md: stack.body });
  }

  // Project-specific commands (build/test/lint) if captured.
  const cmds = manifest.project?.sections?.commands;
  if (cmds && Object.values(cmds).some(Boolean)) {
    const lines = Object.entries(cmds)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k.padEnd(10)} ${v}`)
      .join('\n');
    sections.push({ title: 'Project Commands', md: `## Project Commands\n\nRun before finishing:\n\n\`\`\`\n${lines}\n\`\`\`` });
  }

  // Skills reference.
  const allSkills = new Map(loadSkills().map((s) => [s.id, s]));
  const selectedSkills = (manifest.skills || []).map((id) => allSkills.get(id)).filter(Boolean);

  return { projectName, description, sections, selectedSkills };
}

/** Render the canonical section list to a markdown body (no top H1, no markers). */
export function renderSections(sections) {
  return sections.map((s) => s.md.trim()).join('\n\n---\n\n');
}

/**
 * Skills section. For Claude the skills are physically installed in
 * `.claude/skills/`; for other tools they're listed as reference playbooks.
 */
export function renderSkills(selectedSkills, { installed }) {
  if (!selectedSkills.length) return '';
  const intro = installed
    ? 'These skills are installed in `.claude/skills/` and load on demand:'
    : 'Reference playbooks for this project (full text in `.claude/skills/` if present):';
  const rows = selectedSkills
    .map((s) => `- **${s.name}** — ${s.description}${s.trigger ? ` _(trigger: ${s.trigger})_` : ''}`)
    .join('\n');
  return `## Skills\n\n${intro}\n\n${rows}`;
}
