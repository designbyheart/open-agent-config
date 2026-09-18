import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, loadSkills } from '../src/catalog.js';
import { renderSkillsInline } from '../src/generate.js';

/**
 * A Windows checkout with core.autocrlf=true (the GitHub runner default) hands
 * every catalog file to us as CRLF. None of these cases can be reproduced by
 * running the suite on Linux or macOS, so they assert against CRLF input
 * directly rather than against whatever the checkout happens to contain.
 */

test('frontmatter parses with CRLF line endings, not just LF', () => {
  const lf = '---\nname: branch-diff\ndescription: Inspect changes.\n---\n\n# branch-diff\n\nBody.\n';
  const crlf = lf.replace(/\n/g, '\r\n');

  for (const [label, text] of [['lf', lf], ['crlf', crlf]]) {
    const { data, body } = parseFrontmatter(text);
    assert.equal(data.name, 'branch-diff', `${label}: name is lost when the block is not recognised`);
    assert.equal(data.description, 'Inspect changes.', label);
    // The block itself must be consumed — leaking it dumps raw YAML into every
    // generated config file.
    assert.ok(!body.includes('---'), `${label}: frontmatter leaked into the body`);
    assert.ok(!/name:\s*branch-diff/.test(body), `${label}: frontmatter leaked into the body`);
  }
});

test('a folded scalar still parses when the block uses CRLF', () => {
  const text = '---\r\nname: s\r\ndescription: >\r\n  one\r\n  two\r\n---\r\n\r\nBody.\r\n';
  const { data } = parseFrontmatter(text);
  assert.equal(data.description, 'one two');
});

test("a skill's own H1 is stripped rather than demoted into a duplicate heading", () => {
  // `.` does not match `\r` in JS, so an \n-only strip silently left the title
  // in place and demoteHeadings turned it into a second `### branch-diff`.
  const skill = {
    id: 'branch-diff',
    name: 'branch-diff',
    description: 'Inspect changes.',
    trigger: '',
    body: '# branch-diff\r\n\r\nUse this skill.\r\n\r\n## Step one\r\n\r\nDo it.\r\n',
  };
  const out = renderSkillsInline([skill], { budget: Infinity });
  const headings = (out.match(/^#{1,6} .*$/gm) || []).map((h) => h.replace(/\r$/, ''));
  assert.deepEqual(
    headings.filter((h) => h.endsWith('branch-diff')),
    ['### branch-diff'],
    `the title must appear once, got:\n${headings.join('\n')}`
  );
  assert.ok(out.includes('Use this skill.'), 'the body still has to survive');
});

test('bundled skill files are listed with forward slashes on every platform', () => {
  const nested = loadSkills().filter((s) => s.requiredFiles.some((f) => f.includes('/') || f.includes('\\')));
  assert.ok(nested.length, 'expected at least one catalog skill to bundle files in subfolders');
  for (const skill of nested) {
    for (const file of skill.requiredFiles) {
      // doctor prints these verbatim ("Skill file missing: .claude/skills/…").
      assert.ok(!file.includes('\\'), `${skill.id}: ${file} would print with a backslash`);
    }
    for (const doc of skill.extraDocs) {
      assert.ok(!doc.path.includes('\\'), `${skill.id}: ${doc.path} would print with a backslash`);
    }
  }
});
