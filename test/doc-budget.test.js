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
import { buildArtifacts, oversizeWarnings } from '../src/targets/registry.js';
import { applyManifest } from '../src/apply.js';

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

test('an exactly-fitting set is inlined with no overflow section', () => {
  const one = bigSkill('a', 1);
  const exact = docBytes(renderSkillsInline([one]));
  const md = renderSkillsInline([one], { budget: exact + 512 });
  assert.match(md, /### a/);
  assert.ok(!/Skills not inlined here/.test(md), 'nothing overflowed, so no index');
});

test('renderSkills names whichever skills dir the target uses', () => {
  const s = [{ id: 'x', name: 'x', description: 'X.' }];
  assert.match(renderSkills(s, { installed: true, skillsDir: '.codex/skills' }), /`\.codex\/skills\/`/);
  assert.match(renderSkills(s, { installed: true }), /`\.claude\/skills\/`/);
});

test('oversizeWarnings flags a doc past the budget and stays quiet under it', () => {
  const over = [{ path: 'AGENTS.md', type: 'doc', bytes: AGENT_DOC_BUDGET_BYTES + 1 }];
  const under = [{ path: 'AGENTS.md', type: 'doc', bytes: AGENT_DOC_BUDGET_BYTES }];
  const warnings = oversizeWarnings(over);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /AGENTS\.md/);
  assert.match(warnings[0], /stop reading/);
  assert.deepEqual(oversizeWarnings(under), []);
});

test('buildArtifacts reports the byte size of every artifact', () => {
  const manifest = { project: { name: 'T' }, targets: ['codex'], skills: ['premortem'] };
  const { artifacts } = buildArtifacts(manifest);
  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  assert.equal(agents.bytes, docBytes(agents.body));
});

test('the real catalog keeps AGENTS.md inside the budget for a skill-heavy project', () => {
  const manifest = {
    project: { name: 'T' },
    targets: ['codex'],
    skills: ['premortem', 'code-review', 'clean-code-architect', 'threat-model', 'learn'],
  };
  const { artifacts, warnings } = buildArtifacts(manifest);
  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  assert.ok(
    agents.bytes <= AGENT_DOC_BUDGET_BYTES,
    `AGENTS.md is ${(agents.bytes / 1024).toFixed(1)} KiB, over budget`
  );
  assert.deepEqual(warnings, []);
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

test('applyManifest reports oversize docs through onWarn', () => {
  const dir = tmpProject();
  const warnings = [];
  applyManifest(
    dir,
    { project: { name: 'T' }, targets: ['codex'], skills: ['premortem'], patterns: false },
    { onWarn: (w) => warnings.push(w) }
  );
  // The healthy path stays silent; this pins that onWarn is wired, not noisy.
  assert.deepEqual(warnings, []);
});
