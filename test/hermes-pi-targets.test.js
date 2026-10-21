import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_DOC_BUDGET_BYTES } from '../src/generate.js';
import { loadTargets, loadOllamaApps } from '../src/catalog.js';
import { allTargets, buildArtifacts, budgetWarning, skillDirsFor } from '../src/targets/registry.js';

const HERMES_BUDGET = 20000; // hermes-agent CONTEXT_FILE_MAX_CHARS

test('catalog/targets.json stays in sync with the target modules', () => {
  const catalog = loadTargets();
  assert.deepEqual(
    catalog.map((t) => t.id).sort(),
    allTargets().map((t) => t.id).sort()
  );
  for (const t of catalog) {
    const mod = allTargets().find((m) => m.id === t.id);
    assert.equal(t.label, mod.label, `${t.id} label`);
    assert.equal(t.supportsSkills, Boolean(mod.supportsSkills), `${t.id} supportsSkills`);
    assert.deepEqual(t.detect, mod.detect, `${t.id} detect`);
  }
});

test('hermes writes its own top-precedence HERMES.md with skills inlined', () => {
  const manifest = { project: { name: 'T' }, targets: ['hermes'], skills: ['premortem'] };
  const { artifacts } = buildArtifacts(manifest);

  const hermes = artifacts.find((a) => a.path === 'HERMES.md');
  assert.ok(hermes, 'hermes must write HERMES.md');
  // Hermes loads exactly one context file and ranks HERMES.md above AGENTS.md,
  // so selecting it alone must not depend on the codex target being selected.
  assert.ok(!artifacts.some((a) => a.path === 'AGENTS.md'), 'hermes must not claim AGENTS.md');

  // Its skills are global (~/.hermes/skills), so a pointer would never resolve.
  assert.match(hermes.body, /### premortem/);
  assert.match(hermes.body, /inlined so this tool can apply them directly/);
  assert.deepEqual(skillDirsFor(manifest), []);
});

test('pi shares AGENTS.md and loads skills from .pi/skills', () => {
  const manifest = { project: { name: 'T' }, targets: ['pi'], skills: ['premortem'] };
  const { artifacts } = buildArtifacts(manifest);

  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  assert.ok(agents, 'pi must write AGENTS.md');
  assert.match(agents.body, /installed in `\.pi\/skills\/`/);
  assert.ok(!/### premortem/.test(agents.body), 'pi loads SKILL.md folders, so no inlining');
  assert.deepEqual(skillDirsFor(manifest), ['.pi/skills']);
});

test('codex and pi both get a skills dir when selected together', () => {
  const manifest = { project: { name: 'T' }, targets: ['codex', 'pi'], skills: ['premortem'] };
  // One deduped AGENTS.md, but the skill folder is copied to both directories
  // so each harness finds it on disk regardless of which target won the dedupe.
  assert.equal(buildArtifacts(manifest).artifacts.filter((a) => a.path === 'AGENTS.md').length, 1);
  assert.deepEqual(skillDirsFor(manifest), ['.agents/skills', '.pi/skills']);
});

test('hermes is sized against its own 20 KB cap, not the shared 32 KiB budget', () => {
  const manifest = { project: { name: 'T' }, targets: ['hermes', 'codex'], skills: ['premortem'] };
  const { artifacts } = buildArtifacts(manifest);

  const hermes = artifacts.find((a) => a.path === 'HERMES.md');
  const agents = artifacts.find((a) => a.path === 'AGENTS.md');
  assert.equal(hermes.docBudget, HERMES_BUDGET);
  assert.equal(agents.docBudget, AGENT_DOC_BUDGET_BYTES);
  assert.ok(hermes.bytes <= HERMES_BUDGET, `${hermes.bytes} bytes exceeds the hermes cap`);
});

test('budgetWarning honours a per-target limit', () => {
  assert.match(budgetWarning('HERMES.md', HERMES_BUDGET + 1, HERMES_BUDGET), /HERMES\.md/);
  assert.equal(budgetWarning('HERMES.md', HERMES_BUDGET, HERMES_BUDGET), null);
  // A file that fits the shared budget can still overflow the tighter one.
  assert.ok(budgetWarning('HERMES.md', 30000, HERMES_BUDGET));
  assert.equal(budgetWarning('AGENTS.md', 30000), null);
});

test('every ollama launch app names a file some target actually writes', () => {
  const written = new Set(loadTargets().flatMap((t) => t.writes));
  for (const app of loadOllamaApps()) {
    assert.ok(written.has(app.reads), `no target writes ${app.reads} for ollama app "${app.id}"`);
  }
});
