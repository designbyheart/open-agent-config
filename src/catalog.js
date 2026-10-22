import path from 'node:path';
import crypto from 'node:crypto';
import { PKG_ROOT } from './paths.js';
import { exists, readText, listFiles, listDirs } from './fsutil.js';

export const CATALOG_DIR = path.join(PKG_ROOT, 'catalog');
export const RULES_DIR = path.join(CATALOG_DIR, 'rules');
export const STACKS_DIR = path.join(RULES_DIR, 'stacks');
export const SKILLS_DIR = path.join(CATALOG_DIR, 'skills');
export const TEMPLATES_DIR = path.join(CATALOG_DIR, 'templates');
export const PATTERNS_TEMPLATE_FILE = path.join(TEMPLATES_DIR, 'communication-patterns.md');
export const TARGETS_FILE = path.join(CATALOG_DIR, 'targets.json');
export const OLLAMA_APPS_FILE = path.join(CATALOG_DIR, 'ollama-apps.json');

/**
 * Catalog text, always LF. Everything downstream assumes `\n` — `writeText`
 * puts CRLF back at the boundary for files that use it — so a Windows checkout
 * with core.autocrlf=true must not leak `\r` into the pipeline. It survived
 * regexes like /^#\s+.*\n+/ silently: `.` does not match `\r` in JS, so a
 * skill's H1 stopped being stripped and reappeared as a duplicate heading.
 */
const readCatalogText = (p) => readText(p).replace(/\r\n/g, '\n');

/**
 * Parse a leading `---` frontmatter block. Handles flat `key: value` pairs and
 * YAML folded/literal scalars (`key: >` or `key: |` followed by indented lines),
 * which some skill formats use for multi-line descriptions.
 */
export function parseFrontmatter(text) {
  // CRLF-tolerant: a Windows checkout with core.autocrlf=true hands us \r\n, and
  // an \n-only anchor silently matches nothing — which would leak the raw
  // frontmatter into every generated config and drop each skill's metadata.
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let val = line.slice(idx + 1).trim();

    if (val === '>' || val === '|') {
      // Folded (>) or literal (|) block scalar: consume indented continuation.
      const collected = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        collected.push(lines[++i].trim());
      }
      data[key] = collected.join(val === '>' ? ' ' : '\n');
      continue;
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return { data, body: m[2] };
}

/** Ordered base rule fragments (catalog/rules/*.md). */
export function loadRules() {
  return listFiles(RULES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(readCatalogText(path.join(RULES_DIR, file)));
      return { id: file.replace(/\.md$/, ''), title: data.title || titleFromBody(body) || file, body: body.trim() };
    });
}

/** Optional stack-specific fragments (catalog/rules/stacks/*.md). */
export function loadStacks() {
  return listFiles(STACKS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(readCatalogText(path.join(STACKS_DIR, file)));
      return { id: file.replace(/\.md$/, ''), label: data.label || file, body: body.trim() };
    });
}

/**
 * Master skills catalog (catalog/skills/<name>/). A skill needs a `SKILL.md`;
 * an optional `skill.json` is preferred for metadata when present.
 * The whole folder — scripts/, references/, assets/, agents/ — is copied on install.
 */
export function loadSkills() {
  return listDirs(SKILLS_DIR)
    .filter((d) => exists(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .map((dir) => {
      const skillDir = path.join(SKILLS_DIR, dir);
      const { data, body } = parseFrontmatter(readCatalogText(path.join(skillDir, 'SKILL.md')));

      let json = {};
      const jsonPath = path.join(skillDir, 'skill.json');
      if (exists(jsonPath)) {
        try {
          json = JSON.parse(readCatalogText(jsonPath));
        } catch {
          /* ignore malformed skill.json; fall back to SKILL.md frontmatter */
        }
      }

      // Bundled content beyond SKILL.md / skill.json. Markdown extras
      // (references/, examples/, …) are inlinable into other tools' single
      // config files; non-text extras (scripts/, assets/, binaries) can only
      // travel with a Claude install.
      const relFiles = walkFiles(skillDir).filter((f) => f !== 'SKILL.md' && f !== 'skill.json');
      const extraDocs = relFiles
        .filter((f) => f.toLowerCase().endsWith('.md'))
        .sort()
        .map((rel) => ({
          path: rel,
          body: readCatalogText(path.join(skillDir, rel)).trim(),
        }));
      const hasNonDocExtras = relFiles.some((f) => !f.toLowerCase().endsWith('.md'));

      return {
        id: dir,
        name: json.name || data.name || dir,
        description: json.description || data.description || '',
        version: json.version || null,
        tags: json.tags || [],
        trigger: data.trigger || '',
        body: body.trim(),
        extraDocs,
        hasNonDocExtras,
        requiredFiles: ['SKILL.md', ...relFiles],
        dir: skillDir,
      };
    });
}

/**
 * Recursively list files under `dir`, as paths relative to `base` and always
 * `/`-separated. These paths are both printed to users and compared against
 * catalog manifests, so a Windows backslash would show up in doctor's output
 * as `.claude/skills/impeccable/scripts\\context.mjs`.
 */
function walkFiles(dir, base = dir) {
  const rel = (p) => path.relative(base, p).split(path.sep).join('/');
  const out = [];
  for (const f of listFiles(dir)) out.push(rel(path.join(dir, f)));
  for (const d of listDirs(dir)) out.push(...walkFiles(path.join(dir, d), base));
  return out;
}

export function skillSourceDir(id) {
  return path.join(SKILLS_DIR, id);
}

export function loadTargets() {
  if (!exists(TARGETS_FILE)) return [];
  return JSON.parse(readCatalogText(TARGETS_FILE));
}

export function loadOllamaApps() {
  if (!exists(OLLAMA_APPS_FILE)) return [];
  return JSON.parse(readCatalogText(OLLAMA_APPS_FILE));
}

function titleFromBody(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * Stable content hash of the rule material a project depends on. Lets `doctor`
 * detect when the catalog has changed since the last generation.
 */
export function hashSource({ stacks = [], skills = [], ollama, patterns } = {}) {
  const h = crypto.createHash('sha256');
  for (const r of loadRules()) h.update(`rule:${r.id}\n${r.body}\n`);
  // The project's own patterns file is inlined into every generated config, so
  // editing it must make `doctor` report the generated files as stale.
  if (patterns) h.update(`patterns:\n${patterns}\n`);
  for (const s of loadStacks()) {
    if (stacks.includes(s.id)) h.update(`stack:${s.id}\n${s.body}\n`);
  }
  // Skill bodies are inlined into non-Claude config files, so a body edit must
  // change the hash — otherwise `doctor` would report a project as current
  // after a skill was revised.
  const skillById = new Map(loadSkills().map((s) => [s.id, s]));
  for (const id of [...skills].sort()) {
    const s = skillById.get(id);
    h.update(`skill:${id}\n${s ? s.body : ''}\n`);
    if (s) for (const d of s.extraDocs || []) h.update(`skilldoc:${d.path}\n${d.body}\n`);
  }
  if (ollama) {
    for (const m of [...(ollama.models || [])].sort()) h.update(`ollama-model:${m}\n`);
    for (const a of [...(ollama.apps || [])].sort()) h.update(`ollama-app:${a}\n`);
  }
  return h.digest('hex').slice(0, 16);
}
