export default {
  id: 'codex',
  label: 'Codex / universal (AGENTS.md)',
  // Codex loads SKILL.md folders natively from `.agents/skills/`, so it gets the
  // short index like Claude does. It used to be flagged false, which forced the
  // inline path and pushed AGENTS.md far past `project_doc_max_bytes` (32 KiB),
  // where Codex silently stops reading — so the skills never arrived at all.
  supportsSkills: true,
  skillsDir: '.agents/skills',
  detect: ['AGENTS.md', '.agents/skills', '.codex'],
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [
      `# AGENTS.md — ${projectName}`,
      '_AI agent behavior guidelines. Read by Codex and any tool that honors AGENTS.md._',
      sectionsMd,
    ];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: 'AGENTS.md', type: 'doc', budgeted: true, body: parts.join('\n\n') }];
  },
};
