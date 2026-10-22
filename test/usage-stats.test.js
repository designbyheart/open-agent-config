import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  parseRepo,
  parseArgs,
  summarize,
  metrics,
  parseHistory,
  weekOverWeek,
  formatTable,
  formatReport,
  historyFile,
} from '../scripts/usage-stats.mjs';

// Run from a git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE. Nothing here
// runs git today, but strip them so a future git call cannot touch the real repo.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const raw = (over = {}) => ({
  name: 'o/r',
  repo: { stargazers_count: 10, forks_count: 2, subscribers_count: 3, open_issues_count: 1 },
  clones: { count: 40, uniques: 12, clones: [] },
  views: { count: 100, uniques: 30, views: [] },
  referrers: [{ referrer: 'github.com', count: 5, uniques: 4 }],
  paths: [{ path: '/o/r', title: 'r', count: 50, uniques: 20 }],
  releases: [{ tag_name: 'v1', assets: [{ name: 'a.tgz', download_count: 7 }] }],
  packages: [{ name: '0.2.5', created_at: '2026-10-01T00:00:00Z' }],
  ...over,
});

test('parseRepo handles the package.json url shapes', () => {
  assert.equal(parseRepo('git+https://github.com/designbyheart/open-agent-config.git'), 'designbyheart/open-agent-config');
  assert.equal(parseRepo('https://github.com/o/r'), 'o/r');
  assert.equal(parseRepo('git@github.com:o/r.git'), 'o/r');
  assert.equal(parseRepo('https://gitlab.com/o/r'), null);
  assert.equal(parseRepo(undefined), null);
});

test('parseArgs reads flags and rejects unknown ones', () => {
  assert.deepEqual(parseArgs(['--json', '--save', '--repo', 'a/b']), { json: true, save: true, repo: 'a/b' });
  assert.equal(parseArgs(['--repo=c/d']).repo, 'c/d');
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('historyFile lives under the config dir, outside the repo', () => {
  assert.equal(historyFile({ XDG_CONFIG_HOME: '/cfg' }), path.join('/cfg', 'oac', 'stats-history.jsonl'));
});

test('summarize picks subscribers as watchers and keeps traffic counts', () => {
  const s = summarize(raw(), new Date('2026-10-22T00:00:00Z'));
  assert.equal(s.watchers, 3);
  assert.deepEqual(s.clones, { count: 40, uniques: 12 });
  assert.deepEqual(s.paths, [{ path: '/o/r', count: 50, uniques: 20 }]);
  assert.deepEqual(s.packages.versions, [{ name: '0.2.5', created: '2026-10-01T00:00:00Z' }]);
  assert.equal(s.packages.downloads, null);
  assert.deepEqual(metrics(s), {
    stars: 10, forks: 2, watchers: 3, openIssues: 1,
    clones: 40, cloneUniques: 12, views: 100, viewUniques: 30, releaseDownloads: 7,
  });
});

test('missing read:packages scope becomes a one-line hint, not a failure', () => {
  const s = summarize(raw({ packages: { error: 'scope' } }));
  assert.equal(s.packages.error, 'scope');
  const report = formatReport(s);
  assert.match(report, /needs read:packages scope: gh auth refresh -s read:packages/);
});

test('parseHistory skips blank and corrupt lines and sorts by date', () => {
  const text = [
    JSON.stringify({ date: '2026-10-15T00:00:00Z', repo: 'o/r', stars: 5 }),
    '',
    '{not json',
    JSON.stringify({ repo: 'o/r', stars: 1 }),
    JSON.stringify({ date: '2026-10-01T00:00:00Z', repo: 'o/r', stars: 2 }),
  ].join('\n');
  assert.deepEqual(parseHistory(text).map((s) => s.stars), [2, 5]);
  assert.deepEqual(parseHistory(''), []);
});

test('weekOverWeek compares against the newest week-old snapshot of the same repo', () => {
  const current = summarize(raw(), new Date('2026-10-22T00:00:00Z'));
  const history = [
    { date: '2026-10-01T00:00:00Z', repo: 'o/r', stars: 1 },
    { date: '2026-10-14T00:00:00Z', repo: 'o/r', stars: 6, clones: { count: 30, uniques: 10 } },
    { date: '2026-10-20T00:00:00Z', repo: 'o/r', stars: 9 },
    { date: '2026-10-14T00:00:00Z', repo: 'x/y', stars: 100 },
  ];
  const wow = weekOverWeek(history, current);
  assert.equal(wow.since, '2026-10-14T00:00:00Z');
  assert.equal(wow.days, 8);
  assert.deepEqual(wow.deltas, { stars: 4, clones: 10, cloneUniques: 2 });

  // Only a recent snapshot: fall back to the oldest earlier one.
  assert.equal(weekOverWeek([history[2]], current).since, '2026-10-20T00:00:00Z');
  assert.equal(weekOverWeek([], current), null);
  assert.equal(weekOverWeek([history[3]], current), null);
});

test('formatTable aligns columns', () => {
  assert.equal(formatTable([['a', 1], ['long', 22]]), 'a     1\nlong  22');
});

test('formatReport shows deltas and says when GitHub exposes no downloads', () => {
  const s = summarize(raw(), new Date('2026-10-22T00:00:00Z'));
  const report = formatReport(s, { since: '2026-10-14T00:00:00Z', days: 8, deltas: { stars: 4, clones: 10, cloneUniques: 2 } });
  assert.match(report, /^stars\s+10\s+\+4$/m);
  assert.match(report, /clones \(14d\)\s+40 \(12 unique\)\s+\+10\/\+2/);
  assert.match(report, /deltas vs 2026-10-14 \(8d ago\)/);
  assert.match(report, /v1\s+a\.tgz\s+7/);
  assert.match(report, /downloads: not exposed by the GitHub Packages API/);
});
