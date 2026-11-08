import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'catalog/skills/tree-index/scripts/tree-index.mjs');

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, OAC_TELEMETRY: '0' } });
  return { ...r, out: r.stdout + r.stderr };
}

function report(year) {
  return [
    `Annual report for FY${year}.`, '',
    '# Financial Summary', '', 'Revenue grew. Total debt, see Appendix G.', '',
    '## Liquidity', '', `Cash in FY${year}.`, '',
    '```', '# not a heading', '```', '',
    '# Notes', '', '## Note 12 Leases', '', `Leases for FY${year}.`, '',
    '# Appendix G Debt Schedule', '', `| Notes 2030 | ${year} |`, '',
  ].join('\n');
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oac-tree-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs/fy2022.md'), report(2022));
  fs.writeFileSync(path.join(dir, 'docs/fy2025.md'), report(2025));
  fs.writeFileSync(path.join(dir, 'docs/contract.txt'), [
    'MASTER SERVICES AGREEMENT', '', '1. Definitions', '', 'Words.', '',
    '1.1 Interpretation', '', 'See Section 4.2.', '', '4. Payment', '', '4.2 Late Fees', '', 'Interest accrues.', '',
  ].join('\n'));
  assert.equal(run(dir, 'build', 'docs').status, 0);
  return dir;
}

test('builds a tree from markdown headings, ignoring fenced code', (t) => {
  const dir = fixture(t);
  const show = run(dir, 'show', '--doc', 'fy2022').stdout;
  assert.match(show, /fy2022:1 {2}Financial Summary {2}\(L3-14\)/);
  assert.match(show, /fy2022:1\.1 {2}Liquidity/);
  assert.match(show, /fy2022:3 {2}Appendix G Debt Schedule/);
  assert.doesNotMatch(show, /not a heading/);
});

test('infers numbered structure from plain text', (t) => {
  const show = run(fixture(t), 'show', '--doc', 'contract').stdout;
  assert.match(show, /contract:2\.1 {2}1\.1 Interpretation/);
  assert.match(show, /contract:3\.1 {2}4\.2 Late Fees/);
});

test('refs resolves pointers within the same document before others', (t) => {
  const dir = fixture(t);
  assert.match(run(dir, 'refs', 'fy2022:1').stdout, /Appendix G -> fy2022:3 {2}\[same title in other docs: fy2025:3\]/);
  assert.match(run(dir, 'refs', 'contract:2.1').stdout, /Section 4\.2 -> contract:3\.1/);
});

test('read returns the full section under a citation header', (t) => {
  const out = run(fixture(t), 'read', 'fy2025:3').stdout;
  assert.match(out, /=== fy2025:3 \| Appendix G Debt Schedule \| docs\/fy2025\.md L/);
  assert.match(out, /\| Notes 2030 \| 2025 \|/);
});

test('summaries survive a rebuild and go stale only when their section changes', (t) => {
  const dir = fixture(t);
  assert.equal(run(dir, 'summarize', 'fy2022:1', 'FY2022 totals; breakdown in Appendix G').status, 0);
  assert.equal(run(dir, 'summarize', 'fy2022:3', 'FY2022 debt table').status, 0);
  const file = path.join(dir, 'docs/fy2022.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Revenue grew.', 'Revenue fell.'));
  assert.match(run(dir, 'build', 'docs').stdout, /kept 1 summary\(ies\), 1 now stale/);
  const show = run(dir, 'show', '--doc', 'fy2022').stdout;
  assert.match(show, /! fy2022:1 {2}Financial Summary/);
  assert.match(show, /\s{2}fy2022:3 {2}Appendix G Debt Schedule .*:: FY2022 debt table/);
  assert.match(run(dir, 'todo').stdout, /! fy2022:1/);
});

test('unknown ids fail loudly', (t) => {
  const r = run(fixture(t), 'read', 'fy2022:99');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown node id/);
});
