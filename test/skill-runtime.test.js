import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/cli.js');
function run(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: { ...process.env, OAC_TELEMETRY: '0' } });
}

test('Impeccable runs from both provider paths and doctor repairs a missing runtime file', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-runtime-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const init = run(cwd, [cli, 'init', '--yes', '--targets=claude,codex', '--skills=impeccable']);
  assert.equal(init.status, 0, init.stderr);
  for (const [providerDir, provider, command] of [['.claude', 'claude-code', '/impeccable'], ['.agents', 'agents', '$impeccable']]) {
    const skill = path.join(cwd, providerDir, 'skills/impeccable');
    const context = run(cwd, [path.join(skill, 'scripts/context.mjs')]);
    assert.equal(context.status, 0, context.stderr);
    assert.match(context.stdout, /RESOLVED_CONTEXT/);
    const prefix = run(cwd, ['--input-type=module', '-e', `import {IMPECCABLE_PROVIDER_ID,IMPECCABLE_COMMAND} from ${JSON.stringify(new URL('file://' + path.join(skill, 'scripts/lib/provider.mjs')).href)}; console.log(IMPECCABLE_PROVIDER_ID,IMPECCABLE_COMMAND);`]);
    assert.equal(prefix.status, 0, prefix.stderr);
    assert.equal(prefix.stdout.trim(), `${provider} ${command}`);
    const help = run(cwd, [path.join(skill, 'scripts/detect.mjs'), '--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Scan files or URLs/);
    for (const rel of ['SKILL.md', 'scripts/context.mjs']) {
      fs.unlinkSync(path.join(skill, rel));
      const broken = run(cwd, [cli, 'doctor']);
      assert.equal(broken.status, 1);
      assert.ok(broken.stdout.includes(`Skill file missing: ${providerDir}/skills/impeccable/${rel}`));
      const sync = run(cwd, [cli, 'sync']);
      assert.equal(sync.status, 0, sync.stderr);
      assert.ok(fs.existsSync(path.join(skill, rel)));
      const doctor = run(cwd, [cli, 'doctor']);
      assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
    }
  }
});
