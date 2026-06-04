export default {
  id: 'claude',
  label: 'Claude Code',
  supportsSkills: true,
  detect: ['CLAUDE.md', '.claude'],
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [`# CLAUDE.md — ${projectName}`, '_Context and guidelines for Claude Code._', sectionsMd];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: 'CLAUDE.md', type: 'doc', body: parts.join('\n\n') }];
  },
};
