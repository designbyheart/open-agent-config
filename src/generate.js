import { loadRules, loadStacks, loadSkills } from './catalog.js';

/** Strip a single leading `# H1` line from a fragment body. */
function stripH1(body) {
  return body.replace(/^#\s+.*\n+/, '').trim();
}

/**
 * Shift every markdown heading down by `levels`, leaving fenced code blocks
 * untouched (so `# comment` lines inside bash/python snippets aren't mangled).
 */
function demoteHeadings(md, levels = 1) {
  const lines = md.split('\n');
  let inFence = false;
  let fenceChar = '';
  return lines
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        const ch = fence[1][0];
        if (!inFence) {
          inFence = true;
          fenceChar = ch;
        } else if (ch === fenceChar) {
          inFence = false;
          fenceChar = '';
        }
        return line;
      }
      if (inFence) return line;
      const h = line.match(/^(#{1,6})(\s)/);
      if (!h) return line;
      return '#'.repeat(Math.min(6, h[1].length + levels)) + line.slice(h[1].length);
    })
    .join('\n');
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

/**
 * Inline full skill playbooks for tools that can't physically load
 * `.claude/skills/` (Cursor, Copilot, Codex, Windsurf, Devin). Each skill's
 * SKILL.md body is embedded — H1 stripped, inner headings demoted to nest under
 * the skill's `###` heading — so the guidance actually reaches the tool instead
 * of being a dangling reference to files it can't open.
 */
export function renderSkillsInline(selectedSkills) {
  if (!selectedSkills.length) return '';
  const intro =
    'The following project skills are inlined so this tool can apply them directly. ' +
    'Each is a self-contained playbook — use it when its trigger matches.';
  const blocks = selectedSkills.map((s) => {
    const meta = [];
    if (s.trigger) meta.push(`_When to use: ${s.trigger}_`);
    else if (s.description) meta.push(`_${s.description}_`);
    if (s.hasNonDocExtras) {
      meta.push(
        '_Note: this skill also ships non-text files (e.g. scripts, assets) that travel only ' +
          'with a Claude Code install; they are not inlined here._'
      );
    }
    const out = [`### ${s.name}`, meta.join('\n\n'), demoteHeadings(stripH1(s.body || ''), 2)];

    // Bundled markdown the skill refers to by path — inline it under matching
    // headings so the reference resolves for tools that can't open the files.
    const docs = s.extraDocs || [];
    if (docs.length) {
      out.push(
        '_Bundled reference files (the playbook above refers to these by path; their full text follows):_'
      );
      for (const doc of docs) {
        out.push(`#### \`${doc.path}\`\n\n${demoteHeadings(stripH1(doc.body), 3)}`);
      }
    }
    return out.filter(Boolean).join('\n\n').trim();
  });
  return `## Skills\n\n${intro}\n\n${blocks.join('\n\n---\n\n')}`;
}
