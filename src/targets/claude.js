const KEYS_COMMAND = [
  '---',
  "description: Print this project's agent aliases, reference codes, and skills",
  'allowed-tools: Bash',
  '---',
  '',
  'Run the command below and print its output verbatim. Add no commentary, no summary,',
  'and no reformatting — it is a reference card, not a task.',
  '',
  '```bash',
  'command -v oac >/dev/null 2>&1 && oac keys || npx -y open-agent-config keys',
  '```',
  '',
].join('\n');

export default {
  id: 'claude',
  label: 'Claude Code',
  supportsSkills: true,
  detect: ['CLAUDE.md', '.claude'],
  render({ projectName, sectionsMd, skillsMd }) {
    const parts = [`# CLAUDE.md — ${projectName}`, '_Context and guidelines for Claude Code._', sectionsMd];
    if (skillsMd) parts.push(skillsMd);
    return [
      { path: 'CLAUDE.md', type: 'doc', body: parts.join('\n\n') },
      // `/keys` — the same reference card the CLI prints, available inside a session.
      { path: '.claude/commands/keys.md', type: 'raw', content: KEYS_COMMAND },
    ];
  },
};
