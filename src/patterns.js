import path from 'node:path';
import { PATTERNS_TEMPLATE_FILE, parseFrontmatter } from './catalog.js';
import { exists, readText, writeText } from './fsutil.js';

/**
 * Per-project communication patterns. Unlike catalog rules — which are shared
 * and regenerated — this file is owned by the project: oac scaffolds it once
 * from the catalog template and never touches it again. Its content is inlined
 * into every generated config so the guidance reaches tools that can't open it.
 */
export const PATTERNS_REL = '.oac/communication-patterns.md';

export function patternsPath(projectDir) {
  return path.join(projectDir, ...PATTERNS_REL.split('/'));
}

/** The project's patterns fragment, or null when absent/empty. */
export function readProjectPatterns(projectDir) {
  if (!projectDir) return null;
  const file = patternsPath(projectDir);
  if (!exists(file)) return null;
  const { data, body } = parseFrontmatter(readText(file));
  // HTML comments in this file are notes to the human maintaining it. They would
  // otherwise be inlined into every generated config and burn context on every turn.
  const trimmed = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!trimmed) return null;
  return { title: data.title || 'Communication Patterns', body: trimmed };
}

/**
 * The patterns in effect for a project: its own tuned file when present, the
 * catalog template otherwise. `oac keys` uses the fallback so it still explains
 * the defaults in a project that opted out of the scaffold.
 */
export function resolvePatterns(projectDir) {
  const own = readProjectPatterns(projectDir);
  if (own) return { ...own, source: PATTERNS_REL };
  const { data, body } = parseFrontmatter(readText(PATTERNS_TEMPLATE_FILE));
  return {
    title: data.title || 'Communication Patterns',
    body: body.replace(/<!--[\s\S]*?-->/g, '').trim(),
    source: 'catalog default',
  };
}

/**
 * Data rows of the first markdown table under a `## <heading>` section.
 * Returns `[[cell, cell], …]` with the header and separator rows dropped.
 */
export function tableUnder(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^#{2,}\\s+${heading}\\s*$`, 'i').test(l.trim()));
  if (start === -1) return [];

  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (/^#{2,}\s/.test(t)) break; // next section
    if (!t.startsWith('|')) continue;
    const cells = t
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
    rows.push(cells);
  }
  return rows.slice(1); // drop the header row
}

/**
 * Write the template into the project on first run. Returns the relative path
 * when created, null when the file already exists — an existing file is the
 * user's tuned copy and is never overwritten.
 */
export function scaffoldPatterns(projectDir) {
  const file = patternsPath(projectDir);
  if (exists(file)) return null;
  writeText(file, readText(PATTERNS_TEMPLATE_FILE));
  return PATTERNS_REL;
}
