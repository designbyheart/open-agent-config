export default {
  id: 'copilot',
  label: 'GitHub Copilot / VS Code',
  supportsSkills: false,
  detect: ['.github/copilot-instructions.md'],
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [
      `# Copilot Instructions — ${projectName}`,
      '_Custom instructions for GitHub Copilot in this repository._',
      sectionsMd,
    ];
    if (skillsMd) parts.push(skillsMd);
    return [{ path: '.github/copilot-instructions.md', type: 'doc', body: parts.join('\n\n') }];
  },
};
