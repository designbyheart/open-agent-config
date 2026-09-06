import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderSkills, renderSkillsInline, docBytes, AGENT_DOC_BUDGET_BYTES } from '../src/generate.js';
import { loadSkills, skillSourceDir } from '../src/catalog.js';
import { buildArtifacts } from '../src/targets/registry.js';
import { applyManifest } from '../src/apply.js';
import { upsert } from '../src/managed.js';

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-compact-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const allSkills = loadSkills().filter((s) => !s.id.startsWith('_'));
const manifest = {
  project: { name: 'Compact output' },
  targets: ['codex'],
  skills: allSkills.map((s) => s.id),
  patterns: false,
};

test('native skill routing stays concise and keeps every selected skill', () => {
  const skills = Array.from({ length: 20 }, (_, i) => ({
    id: `skill-${i}`, name: `skill-${i}`,
    description: `Use for task ${i}. ${'Details belong in the skill file. '.repeat(20)}`,
    trigger: 'Separate trigger prose. '.repeat(20),
  }));
  const md = renderSkills(skills, { installed: true, skillsDir: '.agents/skills' });
  assert.ok(docBytes(md) < 4 * 1024);
  for (const s of skills) assert.ok(md.includes(`**${s.name}**`));
  assert.match(md, /SKILL\.md/);
  assert.doesNotMatch(md, /Separate trigger prose/);
});

test('native index keeps a trigger when a skill has no description', () => {
  const md = renderSkills([{ id: 'lint', name: 'Lint', trigger: 'Check source style.' }], { installed: true });
  assert.match(md, /Check source style\./);
});

test('native index falls back to file locations when descriptions cannot fit', () => {
  const skills = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, name: `Skill ${i}`, description: 'Long routing description. '.repeat(20),
  }));
  const md = renderSkills(skills, { installed: true, budget: 900 });
  assert.ok(docBytes(md) <= 900);
  for (const s of skills) {
    assert.ok(md.includes(`**${s.name}**`));
    assert.ok(md.includes(`${s.id}/SKILL.md`));
  }
});

test('default native output leaves room for project-specific instructions', () => {
  const { artifacts } = buildArtifacts(manifest);
  assert.ok(artifacts[0].bytes < 16 * 1024, `${artifacts[0].bytes} bytes`);
});

test('rendering reserves handwritten content per target and stays idempotent', (t) => {
  const dir = project(t);
  const selected = { ...manifest, targets: ['codex', 'claude'] };
  const bare = buildArtifacts({ ...selected, skills: [] }).artifacts.find((a) => a.path === 'AGENTS.md');
  const preamble = 'User guidance\n' + 'x'.repeat(AGENT_DOC_BUDGET_BYTES - docBytes(upsert('', bare.body)) - 5000) + '\n';
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), preamble);
  const warnings = [];
  applyManifest(dir, selected, { onWarn: (w) => warnings.push(w) });
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith(preamble));
  assert.ok(docBytes(agents) <= AGENT_DOC_BUDGET_BYTES, `${docBytes(agents)} bytes`);
  assert.deepEqual(warnings, []);
  for (const id of selected.skills) {
    assert.ok(agents.includes(id));
    assert.equal(fs.readFileSync(path.join(dir, '.agents/skills', id, 'SKILL.md'), 'utf8'),
      fs.readFileSync(path.join(skillSourceDir(id), 'SKILL.md'), 'utf8'));
  }
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  applyManifest(dir, selected);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), agents);
  assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), claude);
});

test('inline targets reserve existing guidance before choosing full skill bodies', (t) => {
  const dir = project(t);
  const selected = { ...manifest, targets: ['windsurf'] };
  const preamble = 'Owner rules\n' + 'x'.repeat(12 * 1024) + '\n';
  fs.writeFileSync(path.join(dir, '.windsurfrules'), preamble);
  const warnings = [];
  applyManifest(dir, selected, { onWarn: (w) => warnings.push(w) });
  const text = fs.readFileSync(path.join(dir, '.windsurfrules'), 'utf8');
  assert.ok(text.startsWith(preamble));
  assert.ok(docBytes(text) <= AGENT_DOC_BUDGET_BYTES, `${docBytes(text)} bytes`);
  assert.deepEqual(warnings, []);
  for (const s of allSkills) assert.ok(text.includes(s.name));
});

test('raw targets budget their replacement, not discarded file content', (t) => {
  const dir = project(t);
  const selected = { ...manifest, targets: ['cursor'] };
  fs.mkdirSync(path.join(dir, '.cursor/rules'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.cursor/rules/oac.mdc'), 'x'.repeat(60 * 1024));
  assert.equal(buildArtifacts(selected, { projectDir: dir }).artifacts[0].content,
    buildArtifacts(selected).artifacts[0].content);
});

test('budgeting preserves CRLF guidance before and after an existing managed block', (t) => {
  const dir = project(t);
  const selected = { ...manifest, targets: ['windsurf'] };
  const before = 'Owner guidance.\r\n'.repeat(600);
  const after = '\r\nKeep this footer.\r\n';
  const existing = upsert(before, 'old generated rules').replace(/\r?\n/g, '\r\n') + after;
  fs.writeFileSync(path.join(dir, '.windsurfrules'), existing);
  const warnings = [];
  applyManifest(dir, selected, { onWarn: (w) => warnings.push(w) });
  const text = fs.readFileSync(path.join(dir, '.windsurfrules'), 'utf8');
  assert.ok(text.startsWith(before));
  assert.ok(text.endsWith(after));
  assert.doesNotMatch(text, /(?<!\r)\n/);
  assert.ok(docBytes(text) <= AGENT_DOC_BUDGET_BYTES, `${docBytes(text)} bytes`);
  assert.deepEqual(warnings, []);
  applyManifest(dir, selected);
  assert.ok(fs.readFileSync(path.join(dir, '.windsurfrules'), 'utf8') === text, 'CRLF sync must be idempotent');
});

test('inline overflow uses names when descriptions alone exceed the remaining budget', () => {
  const skills = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, name: `Skill ${i}`,
    description: 'Lengthy routing description. '.repeat(20),
    trigger: 'Detailed trigger. '.repeat(20), body: 'x'.repeat(10000),
  }));
  const md = renderSkillsInline(skills, { budget: 1000 });
  assert.ok(docBytes(md) <= 1000, `${docBytes(md)} bytes`);
  for (const s of skills) assert.ok(md.includes(`**${s.name}**`));
  assert.match(md, /ask for one by name/i);
});

test('names-only overflow still leaves room for full skill bodies that fit', () => {
  const skills = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, name: `Skill ${i}`,
    description: 'Lengthy routing description. '.repeat(20),
    trigger: 'Detailed trigger. '.repeat(20), body: 'Useful instructions. '.repeat(15),
  }));
  const md = renderSkillsInline(skills, { budget: 2500 });
  assert.ok(docBytes(md) <= 2500);
  assert.match(md, /^### Skill \d+/m);
  for (const s of skills) assert.ok(md.includes(s.name));
});
