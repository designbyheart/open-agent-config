import { wrap } from '../managed.js';

export default {
  id: 'cursor',
  label: 'Cursor',
  supportsSkills: false,
  detect: ['.cursor', '.cursorrules'],
  render({ projectName, sectionsMd, skillsMd }) {
    // Cursor project rules: .mdc with leading frontmatter. The whole file is
    // generated, so it is rewritten deterministically on every sync.
    const frontmatter = [
      '---',
      `description: ${projectName} — project rules`,
      'globs: "**/*"',
      'alwaysApply: true',
      '---',
    ].join('\n');
    const body = [sectionsMd, skillsMd].filter(Boolean).join('\n\n');
    const content = `${frontmatter}\n\n${wrap(body)}`;
    return [{ path: '.cursor/rules/oac.mdc', type: 'raw', content }];
  },
};
