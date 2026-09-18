export default {
  id: 'hermes',
  label: 'Hermes Agent',
  // Hermes skills live in the user-global `~/.hermes/skills/` (plus any
  // `skills.external_dirs` from its config.yaml) — there is no project-local
  // skills directory, so a copied `.hermes/skills/` folder would never be read.
  // Inlining is the only way the guidance reaches it.
  supportsSkills: false,
  // Hermes truncates every context source at CONTEXT_FILE_MAX_CHARS (20_000),
  // well under the 32 KiB most tools allow. Measuring bytes against a char cap
  // errs early on non-ASCII content, which is the safe direction.
  docBudget: 20000,
  detect: ['HERMES.md', '.hermes.md', '.hermes'],
  // Hermes loads exactly ONE project context file, first match wins:
  // .hermes.md/HERMES.md (walked to the git root) → AGENTS.md → CLAUDE.md →
  // .cursorrules. Writing its own top file means selecting `hermes` alone works
  // without `codex`, and never contests the shared AGENTS.md artifact.
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [
      `# HERMES.md — ${projectName}`,
      '_AI agent behavior guidelines. Read by Hermes Agent, which loads this file ahead of AGENTS.md._',
      sectionsMd,
    ];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: 'HERMES.md', type: 'doc', budgeted: true, body: parts.join('\n\n') }];
  },
};
