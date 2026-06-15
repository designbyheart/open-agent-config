import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSkillsInline, renderSkills } from '../src/generate.js';
import { buildArtifacts } from '../src/targets/registry.js';

const fakeSkill = {
  id: 'demo',
  name: 'demo',
  description: 'A demo skill.',
  trigger: 'When demoing.',
  body: ['# Demo Skill', '', '## Section', '', '```bash', '# not a heading', 'echo hi', '```'].join('\n'),
};

test('renderSkillsInline embeds the full body and nests headings under ###', () => {
  const md = renderSkillsInline([fakeSkill]);
  assert.match(md, /## Skills/);
  assert.match(md, /### demo/);
  assert.match(md, /_When to use: When demoing\._/);
  // Body H1 is stripped; "## Section" is demoted by 2 to "#### Section".
  assert.match(md, /\n#### Section\n/);
  assert.ok(!/\n## Section\n/.test(md), 'inner heading must be demoted, not left at H2');
});

test('renderSkillsInline does not mangle # comments inside code fences', () => {
  const md = renderSkillsInline([fakeSkill]);
  assert.match(md, /\n# not a heading\n/, 'code-fence comment must stay a single #');
});

test('renderSkillsInline inlines bundled markdown docs under matching path headings', () => {
  const withDocs = renderSkillsInline([
    { ...fakeSkill, extraDocs: [{ path: 'examples/x.md', body: '# X\n\n## Detail\nbody' }] },
  ]);
  assert.match(withDocs, /#### `examples\/x\.md`/);
  assert.match(withDocs, /Bundled reference files/);
  assert.match(withDocs, /body/);
});

test('renderSkillsInline only flags genuinely non-text extras as Claude-only', () => {
  const nonText = renderSkillsInline([{ ...fakeSkill, hasNonDocExtras: true }]);
  assert.match(nonText, /non-text files/);
  // markdown-only extras must NOT trigger the Claude-only note (they get inlined)
  const mdOnly = renderSkillsInline([{ ...fakeSkill, extraDocs: [{ path: 'r.md', body: 'hi' }] }]);
  assert.ok(!/non-text files/.test(mdOnly));
});

test('empty selection renders nothing', () => {
  assert.equal(renderSkillsInline([]), '');
});

test('non-Claude targets inline skill bodies; Claude gets the short list', () => {
  const manifest = { project: { name: 'T' }, targets: ['codex', 'claude'], skills: ['premortem'] };
  const { artifacts } = buildArtifacts(manifest);
  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  const claude = artifacts.find((a) => a.path === 'CLAUDE.md');

  // Codex (AGENTS.md) inlines the playbook.
  assert.match(agents.body, /### premortem/);
  assert.match(agents.body, /inlined so this tool can apply them directly/);

  // Claude references the installed skill instead of inlining it.
  assert.match(claude.body, /installed in `\.claude\/skills\/`/);
  assert.ok(!/### premortem/.test(claude.body), 'Claude config must not inline the body');
});

test('renderSkills (Claude list) stays a one-line-per-skill reference', () => {
  const md = renderSkills([fakeSkill], { installed: true });
  assert.match(md, /- \*\*demo\*\* — A demo skill\./);
  assert.ok(!/#### Section/.test(md), 'list mode must not embed the body');
});
