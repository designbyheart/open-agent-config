export default {
  id: 'windsurf',
  label: 'Windsurf',
  supportsSkills: false,
  detect: ['.windsurfrules', '.windsurf'],
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [`# Windsurf Rules — ${projectName}`, sectionsMd];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: '.windsurfrules', type: 'doc', body: parts.join('\n\n') }];
  },
};
