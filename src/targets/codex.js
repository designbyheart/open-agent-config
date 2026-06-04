export default {
  id: 'codex',
  label: 'Codex / universal (AGENTS.md)',
  supportsSkills: false,
  detect: ['AGENTS.md', '.codex'],
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [
      `# AGENTS.md — ${projectName}`,
      '_AI agent behavior guidelines. Read by Codex and any tool that honors AGENTS.md._',
      sectionsMd,
    ];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: 'AGENTS.md', type: 'doc', body: parts.join('\n\n') }];
  },
};
