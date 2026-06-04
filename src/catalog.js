import path from 'node:path';
import crypto from 'node:crypto';
import { PKG_ROOT } from './paths.js';
import { exists, readText, listFiles, listDirs } from './fsutil.js';

export const CATALOG_DIR = path.join(PKG_ROOT, 'catalog');
export const RULES_DIR = path.join(CATALOG_DIR, 'rules');
export const STACKS_DIR = path.join(RULES_DIR, 'stacks');
export const SKILLS_DIR = path.join(CATALOG_DIR, 'skills');
export const TARGETS_FILE = path.join(CATALOG_DIR, 'targets.json');
export const OLLAMA_APPS_FILE = path.join(CATALOG_DIR, 'ollama-apps.json');

/**
 * Parse a leading `---` frontmatter block. Handles flat `key: value` pairs and
 * YAML folded/literal scalars (`key: >` or `key: |` followed by indented lines),
 * which the Tobii skill format uses for multi-line descriptions.
 */
export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  const lines = m[1].split('\n');
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
      const { data, body } = parseFrontmatter(readText(path.join(RULES_DIR, file)));
      return { id: file.replace(/\.md$/, ''), title: data.title || titleFromBody(body) || file, body: body.trim() };
    });
}

/** Optional stack-specific fragments (catalog/rules/stacks/*.md). */
export function loadStacks() {
  return listFiles(STACKS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(readText(path.join(STACKS_DIR, file)));
      return { id: file.replace(/\.md$/, ''), label: data.label || file, body: body.trim() };
    });
}

/**
 * Master skills catalog (catalog/skills/<name>/). A skill needs a `SKILL.md`;
 * an optional `skill.json` (Tobii format) is preferred for metadata when present.
 * The whole folder — scripts/, references/, assets/, agents/ — is copied on install.
 */
export function loadSkills() {
  return listDirs(SKILLS_DIR)
    .filter((d) => exists(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .map((dir) => {
      const skillDir = path.join(SKILLS_DIR, dir);
      const { data } = parseFrontmatter(readText(path.join(skillDir, 'SKILL.md')));

      let json = {};
      const jsonPath = path.join(skillDir, 'skill.json');
      if (exists(jsonPath)) {
        try {
          json = JSON.parse(readText(jsonPath));
        } catch {
          /* ignore malformed skill.json; fall back to SKILL.md frontmatter */
        }
      }

      return {
        id: dir,
        name: json.name || data.name || dir,
        description: json.description || data.description || '',
        version: json.version || null,
        tags: json.tags || [],
        trigger: data.trigger || '',
        dir: skillDir,
      };
    });
}

export function skillSourceDir(id) {
  return path.join(SKILLS_DIR, id);
}

export function loadTargets() {
  if (!exists(TARGETS_FILE)) return [];
  return JSON.parse(readText(TARGETS_FILE));
}

export function loadOllamaApps() {
  if (!exists(OLLAMA_APPS_FILE)) return [];
  return JSON.parse(readText(OLLAMA_APPS_FILE));
}

function titleFromBody(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * Stable content hash of the rule material a project depends on. Lets `doctor`
 * detect when the catalog has changed since the last generation.
 */
export function hashSource({ stacks = [], skills = [], ollama } = {}) {
  const h = crypto.createHash('sha256');
  for (const r of loadRules()) h.update(`rule:${r.id}\n${r.body}\n`);
  for (const s of loadStacks()) {
    if (stacks.includes(s.id)) h.update(`stack:${s.id}\n${s.body}\n`);
  }
  for (const id of [...skills].sort()) h.update(`skill:${id}\n`);
  if (ollama) {
    for (const m of [...(ollama.models || [])].sort()) h.update(`ollama-model:${m}\n`);
    for (const a of [...(ollama.apps || [])].sort()) h.update(`ollama-app:${a}\n`);
  }
  return h.digest('hex').slice(0, 16);
}
