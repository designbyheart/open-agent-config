import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  MANIFEST_NAME,
  LEGACY_MANIFEST_NAMES,
  SCHEMA_VERSION,
  manifestPath,
  manifestReadPath,
  manifestExists,
  readManifest,
  writeManifest,
  makeManifest,
} from '../src/manifest.js';

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oac-manifest-'));
}

test('makeManifest fills defaults and stamps the schema version', () => {
  const m = makeManifest({ project: { name: 'demo' }, targets: ['claude'] });
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(m.project.name, 'demo');
  assert.deepEqual(m.targets, ['claude']);
  assert.deepEqual(m.skills, []);
  assert.equal(m.skillsOnly, false);
  assert.deepEqual(m.ollama, { models: [], apps: [] });
});

test('write then read round-trips through the current manifest name', () => {
  const dir = tmpProject();
  writeManifest(dir, makeManifest({ project: { name: 'demo' }, targets: ['codex'] }));
  assert.ok(fs.existsSync(path.join(dir, MANIFEST_NAME)));
  assert.equal(manifestExists(dir), true);
  assert.deepEqual(readManifest(dir).targets, ['codex']);
});

test('a legacy manifest from an older version is still found', () => {
  const dir = tmpProject();
  const legacy = LEGACY_MANIFEST_NAMES[0];
  fs.writeFileSync(
    path.join(dir, legacy),
    JSON.stringify({ schemaVersion: 1, project: { name: 'old' }, targets: ['cursor'] }),
  );
  assert.equal(manifestExists(dir), true);
  assert.equal(path.basename(manifestReadPath(dir)), legacy);
  assert.deepEqual(readManifest(dir).targets, ['cursor']);
});

test('writing migrates a legacy manifest to the current name', () => {
  const dir = tmpProject();
  const legacy = path.join(dir, LEGACY_MANIFEST_NAMES[0]);
  fs.writeFileSync(legacy, JSON.stringify({ targets: ['old'] }));

  writeManifest(dir, makeManifest({ project: { name: 'new' }, targets: ['new'] }));

  assert.ok(fs.existsSync(path.join(dir, MANIFEST_NAME)), 'current manifest must be written');
  assert.equal(fs.existsSync(legacy), false, 'legacy manifest must not linger');
  assert.deepEqual(readManifest(dir).targets, ['new']);
});

test('writes always target the current name, never the legacy one', () => {
  const dir = tmpProject();
  assert.equal(path.basename(manifestPath(dir)), MANIFEST_NAME);
});

test('no manifest reads as null, not a crash', () => {
  assert.equal(readManifest(tmpProject()), null);
  assert.equal(manifestExists(tmpProject()), false);
});

test('a corrupt manifest fails loudly', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, MANIFEST_NAME), '{ not json');
  assert.throws(() => readManifest(dir), /not valid JSON/);
});
