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
import { buildArtifacts, oversizeWarnings, skillDirsFor } from '../src/targets/registry.js';
import { applyManifest } from '../src/apply.js';
import { loadSkills } from '../src/catalog.js';

/**
 * Codex sums every project doc against `project_doc_max_bytes` (32 KiB) and
 * then stops reading, silently. These tests pin the behavior that keeps
 * generated docs on the readable side of that line.
 */

function bigSkill(id, kib) {
  return {
    id,
    name: id,
    description: `The ${id} skill.`,
    trigger: `When ${id}.`,
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
  // and have oversizeWarnings say so than drop skills from the list silently.
  const skills = Array.from({ length: 40 }, (_, i) => bigSkill(`s${i}`, 20));
  const md = renderSkillsInline(skills, { budget: 512 });
  for (const s of skills) assert.match(md, new RegExp(`\\*\\*${s.name}\\*\\*`));
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

test('oversizeWarnings flags a budgeted doc past the limit, quiet at the limit', () => {
  const over = [{ path: 'AGENTS.md', budgeted: true, bytes: AGENT_DOC_BUDGET_BYTES + 1 }];
  const under = [{ path: 'AGENTS.md', budgeted: true, bytes: AGENT_DOC_BUDGET_BYTES }];
  const warnings = oversizeWarnings(over);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /AGENTS\.md/);
  assert.match(warnings[0], /stop reading/);
  assert.deepEqual(oversizeWarnings(under), []);
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
  const { artifacts, warnings } = buildArtifacts(manifest);
  const rules = artifacts.find((a) => a.path === '.windsurfrules');
  assert.ok(
    rules.bytes <= AGENT_DOC_BUDGET_BYTES,
    `.windsurfrules is ${(rules.bytes / 1024).toFixed(1)} KiB, over budget`
  );
  assert.deepEqual(warnings, []);
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
  const every = loadSkills().map((s) => s.id);
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

test('index rows are clamped so a large selection cannot eat the whole budget', () => {
  const wordy = {
    id: 'w',
    name: 'w',
    description: 'D'.repeat(400),
    trigger: 'T'.repeat(400),
  };
  const row = renderSkills([wordy], { installed: true });
  assert.ok(docBytes(row) < 400, `index row is ${docBytes(row)} bytes; clamping is not applied`);
  assert.match(row, /…/, 'a clamped row should show it was truncated');
  // A short description is left exactly as written.
  assert.match(renderSkills([{ id: 'x', name: 'x', description: 'Short.' }], { installed: true }), /— Short\./);
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

test('a skill removed from the manifest is deleted from every skills directory', () => {
  const dir = tmpProject();
  const manifest = {
    project: { name: 'T' },
    targets: ['claude', 'codex'],
    skills: ['premortem', 'code-review'],
    patterns: false,
  };
  applyManifest(dir, manifest);
  for (const d of ['.claude', '.codex']) {
    assert.ok(fs.existsSync(path.join(dir, d, 'skills', 'premortem')));
  }

  // What cmdRemoveSkill does: drop it from the manifest, then clear every dir.
  manifest.skills = manifest.skills.filter((s) => s !== 'premortem');
  for (const rel of skillDirsFor(manifest)) {
    fs.rmSync(path.join(dir, ...rel.split('/'), 'premortem'), { recursive: true, force: true });
  }
  applyManifest(dir, manifest);

  for (const d of ['.claude', '.codex']) {
    assert.equal(
      fs.existsSync(path.join(dir, d, 'skills', 'premortem')),
      false,
      `${d}/skills/premortem survived removal`
    );
    assert.ok(fs.existsSync(path.join(dir, d, 'skills', 'code-review')), 'the kept skill stays');
  }
});
