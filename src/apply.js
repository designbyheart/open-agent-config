import path from 'node:path';
import { buildArtifacts } from './targets/registry.js';
import { skillSourceDir } from './catalog.js';
import { scaffoldPatterns } from './patterns.js';
import { upsert } from './managed.js';
import { exists, readText, writeText, copyDir, ensureDir, chmodSafe } from './fsutil.js';

/** Where skills go when nothing else claims them (skills-only, no skill target). */
const DEFAULT_SKILLS_DIR = '.claude/skills';

/**
 * Write all generated config files + install skills for a project, based on its
 * manifest. Idempotent: managed-block files preserve content outside markers;
 * raw files are rewritten deterministically. Returns the list of written paths.
 *
 * `onWarn` receives non-fatal problems with the generated output — currently
 * instruction docs that exceed the agent-doc byte budget and will therefore be
 * silently truncated by their consumer. Defaults to a no-op so existing callers
 * are unaffected.
 */
export function applyManifest(projectDir, manifest, { onWarn = () => {} } = {}) {
  const written = [];

  // Scaffold the project's patterns file before assembling, so a first run
  // inlines it too. Skipped in skills-only mode (no rule files are managed) and
  // when the project opted out with `patterns: false`.
  if (!manifest.skillsOnly && manifest.patterns !== false) {
    const created = scaffoldPatterns(projectDir);
    if (created) written.push(created);
  }

  const { artifacts, doc, skillTargets, warnings } = buildArtifacts(manifest, { projectDir });
  for (const w of warnings) onWarn(w);

  // skills-only mode never writes/modifies rule files — only skills + manifest.
  if (!manifest.skillsOnly) {
    for (const a of artifacts) {
      const abs = path.join(projectDir, a.path);
      if (a.type === 'raw') {
        writeText(abs, a.content);
      } else {
        const existing = exists(abs) ? readText(abs) : '';
        writeText(abs, upsert(existing, a.body));
      }
      if (a.mode) chmodSafe(abs, a.mode);
      written.push(a.path);
    }
  }

  // Install skills into every selected target that loads them natively —
  // `.claude/skills/` for Claude, `.codex/skills/` for Codex. In skills-only
  // mode this happens regardless of targets, defaulting to Claude's directory
  // when no skill-capable target is selected.
  if ((manifest.skillsOnly || skillTargets.length) && (manifest.skills || []).length) {
    const dirs = skillTargets.map((t) => t.skillsDir);
    if (!dirs.length) dirs.push(DEFAULT_SKILLS_DIR);
    for (const rel of dirs) {
      const skillsRoot = path.join(projectDir, ...rel.split('/'));
      ensureDir(skillsRoot);
      for (const skill of doc.selectedSkills) {
        copyDir(skillSourceDir(skill.id), path.join(skillsRoot, skill.id));
        written.push(`${rel}/${skill.id}/`);
      }
    }
  }

  return written;
}
