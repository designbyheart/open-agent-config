export default {
  id: 'pi',
  label: 'Pi',
  // Pi loads SKILL.md folders natively from `.pi/skills/`, so it gets the short
  // index like Claude and Codex rather than every skill body inlined.
  supportsSkills: true,
  skillsDir: '.pi/skills',
  detect: ['.pi', 'AGENTS.md'],
  // Pi reads AGENTS.md (then CLAUDE.md), walking from the cwd up through its
  // ancestors, so it shares the universal file. If Codex or Devin is also
  // selected the registry dedupes the duplicate AGENTS.md artifact.
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [
      `# AGENTS.md — ${projectName}`,
      '_AI agent behavior guidelines. Read by Pi and any tool that honors AGENTS.md._',
      sectionsMd,
    ];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: 'AGENTS.md', type: 'doc', budgeted: true, body: parts.join('\n\n') }];
  },
};
