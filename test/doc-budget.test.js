import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  renderSkillsInline,
  renderSkills,
  docBytes,
  AGENT_DOC_BUDGET_BYTES,
} from '../src/generate.js';
import { buildArtifacts, budgetWarning, skillDirsFor } from '../src/targets/registry.js';
import { applyManifest } from '../src/apply.js';
import { loadSkills, hashSource } from '../src/catalog.js';
import { readManifest, writeManifest, makeManifest } from '../src/manifest.js';
import { writeText } from '../src/fsutil.js';
import { cmdRemoveSkill } from '../src/commands/skill.js';
import { cmdDoctor } from '../src/commands/doctor.js';

/**
 * Codex sums every project doc against `project_doc_max_bytes` (32 KiB) and
 * then stops reading, silently. These tests pin the behavior that keeps
 * generated docs on the readable side of that line.
 */

// Descriptions and triggers are deliberately long: real catalog descriptions
// run to ~370 characters, and the index-reserve bugs this file guards against
// only appear when index rows are expensive. A terse fixture hides them.
function bigSkill(id, kib) {
  return {
    id,
    name: id,
    description: `The ${id} skill. ${'Detailed description text. '.repeat(12)}`.trim(),
    trigger: `When ${id} applies. ${'Trigger condition prose. '.repeat(8)}`.trim(),
    body: `# ${id}\n\n${'x'.repeat(kib * 1024)}`,
  };
}

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oac-budget-'));
}

test('no budget inlines everything, as before', () => {
  const md = renderSkillsInline([bigSkill('a', 40), bigSkill('b', 40)]);
  assert.match(md, /### a/);
  assert.match(md, /### b/);
  assert.ok(!/Skills not inlined here/.test(md));
});

test('a budget caps the rendered section', () => {
  const budget = 8 * 1024;
  const md = renderSkillsInline([bigSkill('a', 6), bigSkill('b', 6), bigSkill('c', 6)], { budget });
  assert.ok(
    docBytes(md) <= budget,
    `section is ${docBytes(md)} bytes, over the ${budget} budget`
  );
});

test('skills that do not fit are indexed, never silently dropped', () => {
  const skills = [bigSkill('a', 6), bigSkill('b', 6), bigSkill('c', 6)];
  const md = renderSkillsInline(skills, { budget: 8 * 1024 });

  assert.match(md, /### a/, 'the first skill should still be inlined');
  assert.match(md, /Skills not inlined here/);
  // Every skill is accounted for: inlined as a block, or named in the index.
  for (const s of skills) {
    assert.ok(md.includes(s.name), `${s.name} vanished from the output entirely`);
  }
  assert.match(md, /- \*\*c\*\* — The c skill\./, 'overflow skills need their index row');
});

test('a budget too small for any body still names every skill', () => {
  const skills = [bigSkill('a', 20), bigSkill('b', 20)];
  const md = renderSkillsInline(skills, { budget: 512 });
  assert.ok(!/### a\n/.test(md), 'nothing should be inlined at this budget');
  assert.match(md, /- \*\*a\*\*/);
  assert.match(md, /- \*\*b\*\*/);
});

test('the index is the floor: it is never truncated to satisfy the budget', () => {
  // Naming every skill costs what it costs. We would rather blow the budget
  // and have budgetWarning say so than drop skills from the list silently.
  const skills = Array.from({ length: 40 }, (_, i) => bigSkill(`s${i}`, 20));
  const md = renderSkillsInline(skills, { budget: 512 });
  for (const s of skills) assert.match(md, new RegExp(`\\*\\*${s.name}\\*\\*`));
});

test('a big playbook early in the list does not crowd out several small ones', () => {
  // Fill order is smallest-first so one 20 KiB body cannot eat the budget that
  // a dozen 1 KiB bodies would have shared. Uniform-size fixtures cannot see
  // this — smallest-first and catalog order are identical there — so the sizes
  // must be mixed, with the large ones first.
  const skills = [
    ...Array.from({ length: 5 }, (_, i) => bigSkill(`big${i}`, 20)),
    ...Array.from({ length: 30 }, (_, i) => bigSkill(`small${i}`, 1)),
  ];
  const md = renderSkillsInline(skills, { budget: 32 * 1024 });
  const inlined = (md.match(/^### (\w+)$/gm) || []).map((h) => h.replace(/^### /, ''));
  assert.ok(
    inlined.filter((n) => n.startsWith('small')).length >= 8,
    `only ${inlined.length} bodies inlined (${inlined.join(', ')}); the big ones ate the budget`
  );
  assert.ok(docBytes(md) <= 32 * 1024);
});

test('inlined blocks are emitted in catalog order, not size order', () => {
  const skills = [bigSkill('zzz', 8), bigSkill('aaa', 1), bigSkill('mmm', 4)];
  const md = renderSkillsInline(skills, { budget: 32 * 1024 });
  const order = (md.match(/^### (\w+)$/gm) || []).map((h) => h.replace(/^### /, ''));
  assert.deepEqual(order, ['zzz', 'aaa', 'mmm'], 'output order must follow the manifest');
});

test('a long selection still inlines what fits instead of indexing everything', () => {
  // Regression: reserving against the whole selection rather than the part that
  // can still overflow crowded out every body, so a large catalog inlined none.
  const skills = Array.from({ length: 50 }, (_, i) => bigSkill(`s${i}`, 1));
  const md = renderSkillsInline(skills, { budget: 32 * 1024 });
  const inlinedCount = (md.match(/^### s\d+$/gm) || []).length;
  assert.ok(inlinedCount >= 10, `only ${inlinedCount} skills inlined; the reserve is too greedy`);
  assert.ok(docBytes(md) <= 32 * 1024);
});

test('the budget holds across a range of selection sizes', () => {
  const budget = 16 * 1024;
  for (const n of [1, 2, 5, 12, 30]) {
    const skills = Array.from({ length: n }, (_, i) => bigSkill(`s${i}`, 3));
    const md = renderSkillsInline(skills, { budget });
    assert.ok(docBytes(md) <= budget, `n=${n} produced ${docBytes(md)} bytes, over ${budget}`);
    for (const s of skills) {
      assert.ok(md.includes(s.name), `n=${n}: ${s.name} vanished entirely`);
    }
  }
});

test('a set that fits exactly is inlined with no overflow section', () => {
  const one = bigSkill('a', 1);
  const exact = docBytes(renderSkillsInline([one]));
  const md = renderSkillsInline([one], { budget: exact });
  assert.match(md, /### a/);
  assert.ok(!/Skills not inlined here/.test(md), 'an exact fit must not overflow');
  assert.equal(docBytes(md), exact);
});

test('one byte under an exact fit pushes the skill into the index', () => {
  const one = bigSkill('a', 1);
  const exact = docBytes(renderSkillsInline([one]));
  const md = renderSkillsInline([one], { budget: exact - 1 });
  assert.ok(!/### a\n/.test(md));
  assert.match(md, /- \*\*a\*\*/);
});

test('renderSkills names whichever skills dir the target uses', () => {
  const s = [{ id: 'x', name: 'x', description: 'X.' }];
  assert.match(renderSkills(s, { installed: true, skillsDir: '.codex/skills' }), /`\.codex\/skills\/`/);
  assert.match(renderSkills(s, { installed: true }), /`\.claude\/skills\/`/);
});

test('budgetWarning fires past the limit and is quiet at exactly the limit', () => {
  const w = budgetWarning('AGENTS.md', AGENT_DOC_BUDGET_BYTES + 1);
  assert.match(w, /AGENTS\.md/);
  assert.match(w, /stop reading/);
  assert.equal(budgetWarning('AGENTS.md', AGENT_DOC_BUDGET_BYTES), null);
});

test('every instruction file is marked budgeted, including Cursor raw output', () => {
  // Cursor writes type 'raw', so a type-based filter silently skipped it even
  // though it takes the same capped skills section.
  const manifest = {
    project: { name: 'T' },
    targets: ['claude', 'codex', 'cursor', 'copilot', 'windsurf', 'devin'],
    skills: ['premortem'],
  };
  const { artifacts } = buildArtifacts(manifest);
  const budgeted = artifacts.filter((a) => a.budgeted).map((a) => a.path).sort();
  assert.deepEqual(budgeted, [
    '.cursor/rules/oac.mdc',
    '.github/copilot-instructions.md',
    '.windsurfrules',
    'AGENTS.md',
    'CLAUDE.md',
  ]);
  // The Claude slash-command file is not an instruction doc and must not be capped.
  const keys = artifacts.find((a) => a.path === '.claude/commands/keys.md');
  assert.ok(keys && !keys.budgeted);
});

test('AGENTS.md goes to the skills-loading target regardless of target order', () => {
  // Devin and Codex share AGENTS.md. First-writer-wins used to hand Codex an
  // inlined AGENTS.md that never mentioned the .codex/skills it had installed.
  for (const targets of [
    ['devin', 'codex'],
    ['codex', 'devin'],
  ]) {
    const { artifacts } = buildArtifacts({ project: { name: 'T' }, targets, skills: ['premortem'] });
    const agents = artifacts.find((a) => a.path === 'AGENTS.md');
    assert.match(
      agents.body,
      /installed in `\.codex\/skills\/`/,
      `targets ${targets.join(',')} produced the inlined variant`
    );
  }
});

test('buildArtifacts reports the byte size of every artifact', () => {
  const manifest = { project: { name: 'T' }, targets: ['codex'], skills: ['premortem'] };
  const { artifacts } = buildArtifacts(manifest);
  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  assert.equal(agents.bytes, docBytes(agents.body));
});

test('the real catalog keeps an inline-only target inside the budget', () => {
  // Windsurf takes the inline path, so this exercises the budget code against
  // the actual catalog rather than the cheap index path Codex now uses.
  const manifest = {
    project: { name: 'T' },
    targets: ['windsurf'],
    skills: ['premortem', 'code-review', 'clean-code-architect', 'threat-model', 'learn'],
  };
  const { artifacts } = buildArtifacts(manifest);
  const rules = artifacts.find((a) => a.path === '.windsurfrules');
  assert.ok(
    rules.bytes <= AGENT_DOC_BUDGET_BYTES,
    `.windsurfrules is ${(rules.bytes / 1024).toFixed(1)} KiB, over budget`
  );
});

/** Skill names whose full body was inlined, ignoring the overflow heading. */
function inlinedBodies(body, ids) {
  const names = new Set(ids);
  return (body.match(/^### (.+)$/gm) || [])
    .map((h) => h.replace(/^### /, ''))
    .filter((n) => names.has(n));
}

test('a realistic selection inlines every body on an inline-only target', () => {
  // The common case must not degrade: a handful of skills should arrive in
  // full, not as an index.
  const skills = ['premortem', 'code-review', 'commit-pr', 'branch-diff', 'naming-review'];
  const { artifacts } = buildArtifacts({ project: { name: 'T' }, targets: ['windsurf'], skills });
  const rules = artifacts.find((a) => a.path === '.windsurfrules');
  assert.ok(rules.bytes <= AGENT_DOC_BUDGET_BYTES);
  assert.deepEqual(inlinedBodies(rules.body, skills).sort(), [...skills].sort());
  assert.ok(!/Skills not inlined here/.test(rules.body), 'nothing should overflow at this size');
});

test('the whole catalog on an inline-only target fits and still carries content', () => {
  // 50 skills average ~19 KiB of playbook against a ~32 KiB file budget, so
  // most must become index rows — that is arithmetic, not a bug. What matters
  // is that the file is readable end to end, every skill is still named, and
  // whatever room is left is spent on real bodies rather than wasted.
  const every = loadSkills().map((s) => s.id).filter((id) => !id.startsWith('_'));
  const { artifacts } = buildArtifacts({
    project: { name: 'T' },
    targets: ['windsurf'],
    skills: every,
  });
  const rules = artifacts.find((a) => a.path === '.windsurfrules');
  assert.ok(
    rules.bytes <= AGENT_DOC_BUDGET_BYTES,
    `.windsurfrules is ${(rules.bytes / 1024).toFixed(1)} KiB with all ${every.length} skills`
  );
  assert.ok(
    inlinedBodies(rules.body, every).length >= 1,
    'the remaining budget should hold at least one real body, not just an index'
  );
  for (const id of every) {
    assert.ok(rules.body.includes(id), `${id} is neither inlined nor indexed`);
  }
});

test('index rows abbreviate only under budget pressure', () => {
  const wordy = { id: 'w', name: 'w', description: 'Word '.repeat(200), trigger: 'Trig '.repeat(200) };

  // Inline path: budget pressure is real, so rows are abbreviated.
  const overflowed = renderSkillsInline([wordy, bigSkill('big', 40)], { budget: 4096 });
  assert.match(overflowed, /…/, 'overflow rows must be clamped');
  assert.match(overflowed, /Descriptions are abbreviated/);

  // Native-install path with room: the description and trigger are the whole
  // routing signal for whether to load the skill, so they stay verbatim.
  const roomy = renderSkills([wordy], { installed: true, skillsDir: '.codex/skills' });
  assert.ok(!roomy.includes('…'), 'the installed-skills index must not truncate when it fits');
  assert.ok(roomy.includes('Word '.repeat(200).trim()), 'full description must survive');

  // Same path under pressure: abbreviate rather than overrun the budget.
  const squeezed = renderSkills([wordy], {
    installed: true,
    skillsDir: '.codex/skills',
    budget: 400,
  });
  assert.match(squeezed, /…/, 'a selection that would not fit must be abbreviated');
  assert.ok(docBytes(squeezed) < docBytes(roomy));
});

/** True if `s` contains a surrogate that is not part of a valid pair. */
function hasLoneSurrogate(s) {
  return /[\uD800-\uDFFF]/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''));
}

test('clamping never splits an astral character', () => {
  // Slicing by UTF-16 code units leaves a lone surrogate, which becomes U+FFFD
  // on write. The fixture needs a body large enough to be pushed into the
  // *index*: a small skill gets inlined, and the inline path prints the
  // description raw, so it would never reach clamp() at all.
  const body = `# e\n\n${'y'.repeat(40 * 1024)}`;
  let sawClamp = false;
  for (let pad = 100; pad < 140; pad++) {
    const s = { id: 'e', name: 'e', description: `${'a'.repeat(pad)}🚀 tail text here`, body };
    const md = renderSkillsInline([s], { budget: 4096 });
    assert.ok(!hasLoneSurrogate(md), `pad=${pad} produced an unpaired surrogate`);
    if (md.includes('…')) sawClamp = true;
  }
  assert.ok(sawClamp, 'the fixture never actually reached the clamping path');
});

test('clamping cuts on a word boundary, not mid-word', () => {
  // The limit must land *inside* a word for this to mean anything: 108
  // characters of short words puts the 119-character cut eleven characters
  // into "supercalifragilistic".
  const words = `${'ab '.repeat(36)}supercalifragilistic and more text follows here`;
  const s = { id: 'w', name: 'w', description: words, body: `# w\n\n${'y'.repeat(40 * 1024)}` };
  const md = renderSkillsInline([s], { budget: 4096 });
  const row = md.split('\n').find((l) => l.startsWith('- **w**'));
  const truncated = row.slice(row.indexOf('—') + 2).replace(/….*$/, '');
  const lastWord = truncated.trimEnd().split(' ').pop();
  assert.ok(
    words.split(' ').includes(lastWord),
    `cut mid-word: row ends with "${lastWord}", which is not a whole word`
  );
});

test('a multi-line description cannot break the row or inject a heading', () => {
  // Skill frontmatter may use a `|` block scalar, so a description can arrive
  // with newlines. Emitted verbatim it ends the list item and promotes the
  // next line to a real heading beside `## Skills`.
  const s = {
    id: 'm',
    name: 'm',
    description: 'Reviews IaC changes.\n## Scope\n- terraform\n- pulumi',
    trigger: 'When reviewing IaC.\n## Notes\nmore',
  };
  // Index paths: the skill must occupy exactly one list row.
  for (const md of [
    renderSkills([s], { installed: true, skillsDir: '.codex/skills' }),
    renderSkills([s], { installed: true, skillsDir: '.codex/skills', budget: 80 }),
    renderSkillsInline([{ ...s, body: `# m\n\n${'y'.repeat(40 * 1024)}` }], { budget: 4096 }),
  ]) {
    const rows = md.split('\n').filter((l) => l.startsWith('- **m**'));
    assert.equal(rows.length, 1, 'the skill must occupy exactly one row');
    assert.ok(!/^## Scope/m.test(md), 'a heading was injected into the document');
    assert.ok(!/^## Notes/m.test(md), 'a heading was injected from the trigger');
  }

  // Inline path: the same text goes into an emphasis span in the meta line,
  // where a raw newline would close the span and inject headings too.
  const inlined = renderSkillsInline([s], { budget: 32 * 1024 });
  assert.match(inlined, /### m/, 'the fixture should be inlined here');
  assert.ok(!/^## Notes/m.test(inlined), 'a heading was injected into the inlined block');
  assert.match(inlined, /_When to use: When reviewing IaC\. ## Notes more_/);
});

test('a skill with no description does not render "undefined"', () => {
  const md = renderSkills([{ id: 'n', name: 'n' }], { installed: true });
  assert.ok(!md.includes('undefined'));
});

test('a short description is left exactly as written even when clamping applies', () => {
  // Body too large to inline, so the row goes through the clamped index path;
  // a description under the limit must come out byte-identical.
  const x = { id: 'x', name: 'x', description: 'Short.', body: `# x\n\n${'y'.repeat(40 * 1024)}` };
  const md = renderSkillsInline([x], { budget: 4096 });
  assert.match(md, /- \*\*x\*\* — Short\./);
  assert.ok(!md.includes('…'));
});

test('codex installs skills into .codex/skills, claude into .claude/skills', () => {
  const dir = tmpProject();
  const manifest = {
    project: { name: 'T' },
    targets: ['codex', 'claude'],
    skills: ['premortem'],
    patterns: false,
  };
  const written = applyManifest(dir, manifest);

  assert.ok(fs.existsSync(path.join(dir, '.codex', 'skills', 'premortem', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'premortem', 'SKILL.md')));
  assert.ok(written.includes('.codex/skills/premortem/'));
  assert.ok(written.includes('.claude/skills/premortem/'));
});

test('a target that cannot load skills installs none', () => {
  const dir = tmpProject();
  const manifest = {
    project: { name: 'T' },
    targets: ['windsurf'],
    skills: ['premortem'],
    patterns: false,
  };
  applyManifest(dir, manifest);
  assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills')), false);
  assert.equal(fs.existsSync(path.join(dir, '.codex', 'skills')), false);
});

test('skills-only with no skill target still falls back to .claude/skills', () => {
  const dir = tmpProject();
  applyManifest(dir, {
    project: { name: 'T' },
    targets: [],
    skills: ['premortem'],
    skillsOnly: true,
  });
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'premortem', 'SKILL.md')));
});

test('onWarn fires for a file pushed over budget by hand-written content', () => {
  // The number that decides what Codex reads is the finished file on disk, not
  // the block oac generated: a big hand-written preamble above the managed
  // block counts too, and used to be measured as zero.
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'x'.repeat(60 * 1024));

  const warnings = [];
  applyManifest(
    dir,
    { project: { name: 'T' }, targets: ['codex'], skills: ['premortem'], patterns: false },
    { onWarn: (w) => warnings.push(w) }
  );

  assert.equal(warnings.length, 1, 'a 60 KiB AGENTS.md must warn');
  assert.match(warnings[0], /AGENTS\.md/);
  assert.ok(
    fs.statSync(path.join(dir, 'AGENTS.md')).size > AGENT_DOC_BUDGET_BYTES,
    'sanity: the file really is over budget'
  );
});

test('a skills-loading target gets an abbreviated index rather than an oversize file', () => {
  // The index for a large selection is not free: unclamped it is ~17 KiB, and
  // AGENTS.md must stay readable end to end. This pins that the budget is
  // actually wired through to renderSkills, not just available to it.
  const every = loadSkills().map((s) => s.id).filter((id) => !id.startsWith('_'));
  const { artifacts } = buildArtifacts({
    project: { name: 'T' },
    targets: ['codex'],
    stacks: ['nextjs'],
    skills: every,
  });
  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  assert.ok(
    agents.bytes <= AGENT_DOC_BUDGET_BYTES,
    `AGENTS.md is ${(agents.bytes / 1024).toFixed(1)} KiB with all ${every.length} skills`
  );
  assert.match(agents.body, /…/, 'rows should be abbreviated at this selection size');
  for (const id of every) assert.ok(agents.body.includes(id), `${id} missing from the index`);
});

test('writeText reports the bytes it actually wrote, CRLF expansion included', () => {
  // On a Windows checkout writeText converts the whole file back to CRLF, so
  // the bytes on disk exceed the string it was handed by one per line. The
  // budget check consumes this return value; measuring the input instead
  // under-counts by ~1.6%, which is the difference between warning and not on
  // a file sitting near the limit. A whole-file size test for that band would
  // be brittle, so the contract is pinned here and its use asserted below.
  const dir = tmpProject();
  const p = path.join(dir, 'AGENTS.md');
  fs.writeFileSync(p, 'existing\r\nfile\r\n');

  const input = 'one\ntwo\nthree\n';
  const written = writeText(p, `existing\nfile\n${input}`);

  assert.ok(written.includes('\r\n'), 'CRLF endings must be preserved');
  assert.equal(
    docBytes(written),
    fs.statSync(p).size,
    'the return value must match the file on disk byte for byte'
  );
  assert.ok(
    docBytes(written) > docBytes(`existing\nfile\n${input}`),
    'the CRLF form must be larger than the string handed in'
  );
});

test('applyManifest sizes budgeted files from what writeText returned', () => {
  // Guards the wiring, not just the contract. The preamble is CRLF, so the
  // whole file is written back as CRLF and the on-disk size exceeds the
  // generated string. Reporting the generated size would name a smaller
  // number than the file actually is.
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), `${'A hand-written line of preamble.'}\r\n`.repeat(1600));
  const warnings = [];
  applyManifest(
    dir,
    { project: { name: 'T' }, targets: ['codex'], skills: ['premortem'], patterns: false },
    { onWarn: (w) => warnings.push(w) }
  );
  const size = fs.statSync(path.join(dir, 'AGENTS.md')).size;
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    new RegExp(`\\b${(size / 1024).toFixed(1)} KiB\\b`),
    `warning should report the on-disk size (${(size / 1024).toFixed(1)} KiB): ${warnings[0]}`
  );
});

test('onWarn stays silent for a healthy project', () => {
  const dir = tmpProject();
  const warnings = [];
  applyManifest(
    dir,
    { project: { name: 'T' }, targets: ['codex'], skills: ['premortem'], patterns: false },
    { onWarn: (w) => warnings.push(w) }
  );
  assert.deepEqual(warnings, []);
});

test('remove-skill has a directory list that covers every install location', () => {
  // The leak this guards: skills were installed into two directories but
  // removed from one, so a removed skill kept loading into Codex forever.
  assert.deepEqual(skillDirsFor({ targets: ['claude', 'codex'] }), [
    '.claude/skills',
    '.codex/skills',
  ]);
  assert.deepEqual(skillDirsFor({ targets: ['windsurf'] }), []);
  assert.deepEqual(skillDirsFor({ targets: [], skillsOnly: true }), ['.claude/skills']);
});

test('oac remove-skill deletes the skill from every skills directory', async () => {
  // Drives the real command, not a reimplementation of it: the leak this
  // guards against lived in cmdRemoveSkill's own path list, so a test that
  // rebuilds that list cannot see it come back.
  const dir = tmpProject();
  writeManifest(
    dir,
    makeManifest({
      project: { name: 'T' },
      targets: ['claude', 'codex'],
      skills: ['premortem', 'code-review'],
      patterns: false,
    })
  );
  applyManifest(dir, readManifest(dir));
  for (const d of ['.claude', '.codex']) {
    assert.ok(fs.existsSync(path.join(dir, d, 'skills', 'premortem')), `setup: ${d} install`);
  }

  const log = console.log;
  console.log = () => {};
  try {
    await cmdRemoveSkill({ positionals: ['premortem'], flags: { dir } });
  } finally {
    console.log = log;
  }

  for (const d of ['.claude', '.codex']) {
    assert.equal(
      fs.existsSync(path.join(dir, d, 'skills', 'premortem')),
      false,
      `${d}/skills/premortem survived remove-skill`
    );
    assert.ok(fs.existsSync(path.join(dir, d, 'skills', 'code-review')), 'the kept skill stays');
  }
  assert.deepEqual(readManifest(dir).skills, ['code-review']);
});

test('doctor flags a deselected catalog skill but never the user own skills', async () => {
  const dir = tmpProject();
  writeManifest(
    dir,
    makeManifest({
      project: { name: 'T' },
      targets: ['claude'],
      skills: ['premortem'],
      patterns: false,
    })
  );
  const m = readManifest(dir);
  applyManifest(dir, m);
  m.sourceHash = hashSource({ stacks: m.stacks, skills: m.skills, ollama: m.ollama });
  writeManifest(dir, m);

  // A skill the team wrote by hand. `.claude/skills/` is Claude Code's own
  // user-skill location; oac must not claim ownership of everything in it.
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'our-house-style'), { recursive: true });
  // A catalog skill left behind after being deselected — that one is oac's.
  fs.cpSync(
    path.join(dir, '.claude', 'skills', 'premortem'),
    path.join(dir, '.claude', 'skills', 'code-review'),
    { recursive: true }
  );

  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(String(s));
  const exit = process.exitCode;
  try {
    await cmdDoctor({ flags: { dir } });
  } finally {
    console.log = log;
    process.exitCode = exit;
  }
  const out = lines.join('\n');

  assert.match(out, /Deselected catalog skill still installed: \.claude\/skills\/code-review\//);
  assert.ok(
    !out.includes('our-house-style'),
    'a hand-written skill must never be reported as a problem'
  );
});
