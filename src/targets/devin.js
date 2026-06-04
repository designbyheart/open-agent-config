export default {
  id: 'devin',
  label: 'Devin',
  supportsSkills: false,
  detect: ['AGENTS.md', '.devin'],
  // Devin reads AGENTS.md natively, so it shares the universal file. If Codex is
  // also selected the registry dedupes the duplicate AGENTS.md artifact.
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [
      `# AGENTS.md — ${projectName}`,
      '_AI agent behavior guidelines. Read by Devin, Codex, and any AGENTS.md-aware tool._',
      sectionsMd,
    ];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: 'AGENTS.md', type: 'doc', body: parts.join('\n\n') }];
  },
};
