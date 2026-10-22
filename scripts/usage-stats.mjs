#!/usr/bin/env node
//
// Maintainer-only reach report from the GitHub API. Not an `oac` command and not
// shipped in the package. Needs an authenticated `gh` with push access (traffic
// endpoints are owner-only).
//
//   npm run stats                       table for the repo in package.json
//   npm run stats -- --json             machine output
//   npm run stats -- --save             also append a snapshot to the history file
//   npm run stats -- --repo owner/name  another repo
//
// GitHub keeps traffic for 14 days only, so `--save` appends a dated snapshot to
// ~/.config/oac/stats-history.jsonl (outside the repo). When history exists the
// report adds deltas against the snapshot closest to a week old.

import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_HINT = 'gh auth refresh -s read:packages';
const DAY = 24 * 60 * 60 * 1000;

export const historyFile = (env = process.env) =>
  path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'oac', 'stats-history.jsonl');

/** "git+https://github.com/o/r.git" → "o/r". */
export function parseRepo(url) {
  const m = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/.exec(String(url ?? ''));
  return m ? `${m[1]}/${m[2]}` : null;
}

export function parseArgs(argv) {
  const opts = { json: false, save: false, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--save') opts.save = true;
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a.startsWith('--repo=')) opts.repo = a.slice(7);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

/** One `gh api` call. Never throws: returns { data } or { error, status }. */
function ghApi(endpoint) {
  const r = spawnSync('gh', ['api', endpoint], { encoding: 'utf8' });
  if (r.error) return { error: `gh not runnable: ${r.error.message}` };
  if (r.status === 0) return { data: JSON.parse(r.stdout) };
  const status = Number(/HTTP (\d{3})/.exec(r.stderr)?.[1]) || null;
  return { error: r.stderr.trim().split('\n').pop(), status };
}

/** Raw API responses → the snapshot that is printed, emitted as JSON and saved. */
export function summarize(raw, now = new Date()) {
  const repo = raw.repo ?? {};
  const traffic = (t) => (t ? { count: t.count, uniques: t.uniques } : null);
  const pkg = raw.packages;
  return {
    date: now.toISOString(),
    repo: raw.name,
    stars: repo.stargazers_count ?? null,
    forks: repo.forks_count ?? null,
    // watchers_count mirrors stars for legacy reasons; subscribers are the real watchers.
    watchers: repo.subscribers_count ?? null,
    // GitHub counts open PRs as issues here.
    openIssues: repo.open_issues_count ?? null,
    clones: traffic(raw.clones),
    views: traffic(raw.views),
    referrers: (raw.referrers ?? []).map(({ referrer, count, uniques }) => ({ referrer, count, uniques })),
    paths: (raw.paths ?? []).map(({ path: p, count, uniques }) => ({ path: p, count, uniques })),
    releases: (raw.releases ?? []).map((r) => ({
      tag: r.tag_name,
      assets: (r.assets ?? []).map((a) => ({ name: a.name, downloads: a.download_count })),
    })),
    // The packages API exposes no download counts for npm packages; versions only.
    packages: Array.isArray(pkg)
      ? { versions: pkg.map((v) => ({ name: v.name, created: v.created_at })), downloads: null }
      : { versions: null, downloads: null, error: pkg?.error ?? null },
  };
}

/** The numbers deltas are computed over. Missing values are left out. */
export function metrics(s) {
  const m = {
    stars: s.stars,
    forks: s.forks,
    watchers: s.watchers,
    openIssues: s.openIssues,
    clones: s.clones?.count,
    cloneUniques: s.clones?.uniques,
    views: s.views?.count,
    viewUniques: s.views?.uniques,
    releaseDownloads: s.releases?.length
      ? s.releases.reduce((n, r) => n + r.assets.reduce((k, a) => k + a.downloads, 0), 0)
      : undefined,
  };
  return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number'));
}

/** JSONL → snapshots, oldest first. Blank or corrupt lines are skipped, not fatal. */
export function parseHistory(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const s = JSON.parse(line);
      if (s && typeof s.date === 'string' && !Number.isNaN(Date.parse(s.date))) out.push(s);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/**
 * Deltas against the newest snapshot at least ~a week older than `current`
 * (falling back to the oldest earlier one), for the same repo. Null when none.
 */
export function weekOverWeek(history, current) {
  const t = Date.parse(current.date);
  const earlier = history.filter((s) => s.repo === current.repo && Date.parse(s.date) < t);
  if (!earlier.length) return null;
  const weekOld = earlier.filter((s) => Date.parse(s.date) <= t - 6.5 * DAY);
  const base = weekOld.length ? weekOld[weekOld.length - 1] : earlier[0];
  const before = metrics(base);
  const now = metrics(current);
  const deltas = {};
  for (const k of Object.keys(now)) if (k in before) deltas[k] = now[k] - before[k];
  return { since: base.date, days: Math.round((t - Date.parse(base.date)) / DAY), deltas };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

/** Rows of cells → left-aligned columns separated by two spaces. */
export function formatTable(rows) {
  const widths = [];
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, String(c).length)));
  return rows.map((r) => r.map((c, i) => String(c).padEnd(i === r.length - 1 ? 0 : widths[i])).join('  ')).join('\n');
}

export function formatReport(s, wow = null) {
  const d = wow?.deltas ?? {};
  const delta = (k) => (k in d ? signed(d[k]) : '');
  const pair = (t, a, b) => (t ? `${t.count} (${t.uniques} unique)` : 'n/a') + (t && (a in d || b in d) ? `  ${delta(a)}/${delta(b)}` : '');
  const lines = [`${s.repo}  ${s.date.slice(0, 10)}`, ''];

  const head = [
    ['stars', s.stars ?? 'n/a', delta('stars')],
    ['forks', s.forks ?? 'n/a', delta('forks')],
    ['watchers', s.watchers ?? 'n/a', delta('watchers')],
    ['open issues+PRs', s.openIssues ?? 'n/a', delta('openIssues')],
    ['clones (14d)', pair(s.clones, 'clones', 'cloneUniques'), ''],
    ['views (14d)', pair(s.views, 'views', 'viewUniques'), ''],
  ];
  lines.push(formatTable(head).replace(/ +$/gm, ''));
  if (wow) lines.push('', `deltas vs ${wow.since.slice(0, 10)} (${wow.days}d ago)`);

  const top = (title, items, key) => {
    lines.push('', title);
    if (!items.length) return lines.push('  none');
    lines.push(formatTable(items.slice(0, 10).map((i) => ['  ' + i[key], i.count, `${i.uniques} unique`])));
  };
  top('top referrers (14d)', s.referrers, 'referrer');
  top('popular paths (14d)', s.paths, 'path');

  lines.push('', 'release downloads');
  const assets = s.releases.flatMap((r) => r.assets.map((a) => ['  ' + r.tag, a.name, a.downloads]));
  if (assets.length) lines.push(formatTable(assets));
  else lines.push(`  ${s.releases.length} release(s), no uploaded assets (source archives are not counted by GitHub)`);
  if ('releaseDownloads' in d) lines.push(`  total ${delta('releaseDownloads')} since last snapshot`);

  lines.push('', 'npm package (GitHub Packages)');
  if (s.packages.versions) {
    lines.push(`  ${s.packages.versions.length} version(s): ${s.packages.versions.map((v) => v.name).join(', ')}`);
    lines.push('  downloads: not exposed by the GitHub Packages API');
  } else if (s.packages.error === 'scope') {
    lines.push(`  needs read:packages scope: ${PACKAGES_HINT}`);
  } else {
    lines.push(`  unavailable: ${s.packages.error}`);
  }
  return lines.join('\n');
}

function collect(name, pkgName) {
  const required = ghApi(`repos/${name}`);
  if (required.error) throw new Error(`repos/${name}: ${required.error}`);
  const optional = (endpoint) => {
    const r = ghApi(endpoint);
    if (r.error) process.stderr.write(`  ! ${endpoint}: ${r.error}\n`);
    return r.data ?? null;
  };
  const [owner] = name.split('/');
  const ownerType = required.data.owner?.type === 'Organization' ? 'orgs' : 'users';
  const pkg = ghApi(`${ownerType}/${owner}/packages/npm/${encodeURIComponent(pkgName)}/versions`);
  return {
    name,
    repo: required.data,
    clones: optional(`repos/${name}/traffic/clones`),
    views: optional(`repos/${name}/traffic/views`),
    referrers: optional(`repos/${name}/traffic/popular/referrers`),
    paths: optional(`repos/${name}/traffic/popular/paths`),
    releases: optional(`repos/${name}/releases?per_page=100`),
    packages: pkg.data ?? { error: pkg.status === 403 ? 'scope' : pkg.error },
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const name = opts.repo || parseRepo(pkg.repository?.url ?? pkg.repository);
  if (!name) throw new Error('could not derive owner/repo from package.json; pass --repo owner/name');
  // Scoped "@scope/name" → "name": the packages API addresses npm packages unscoped.
  const pkgName = opts.repo ? name.split('/')[1] : pkg.name.replace(/^@[^/]+\//, '');

  const snapshot = summarize(collect(name, pkgName));
  const file = historyFile();
  const history = existsSync(file) ? parseHistory(readFileSync(file, 'utf8')) : [];
  const wow = weekOverWeek(history, snapshot);

  if (opts.save) {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(snapshot) + '\n');
  }

  if (opts.json) process.stdout.write(JSON.stringify({ ...snapshot, weekOverWeek: wow }, null, 2) + '\n');
  else process.stdout.write(formatReport(snapshot, wow) + (opts.save ? `\n\nsaved snapshot to ${file}` : '') + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`\n  ✖ stats: ${e.message}\n\n`);
    process.exit(1);
  }
}
