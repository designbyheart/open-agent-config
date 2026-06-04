import path from 'node:path';
import { buildArtifacts } from './targets/registry.js';
import { skillSourceDir } from './catalog.js';
import { upsert } from './managed.js';
import { exists, readText, writeText, copyDir, ensureDir, chmodSafe } from './fsutil.js';

/**
 * Write all generated config files + install skills for a project, based on its
 * manifest. Idempotent: managed-block files preserve content outside markers;
 * raw files are rewritten deterministically. Returns the list of written paths.
 */
export function applyManifest(projectDir, manifest) {
  const { artifacts, doc, claudeSelected } = buildArtifacts(manifest);
  const written = [];

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

  // Install skills into .claude/skills/. In skills-only mode this happens
  // regardless of targets; otherwise only when Claude is a target.
  if ((manifest.skillsOnly || claudeSelected) && (manifest.skills || []).length) {
    const skillsRoot = path.join(projectDir, '.claude', 'skills');
    ensureDir(skillsRoot);
    for (const skill of doc.selectedSkills) {
      copyDir(skillSourceDir(skill.id), path.join(skillsRoot, skill.id));
      written.push(`.claude/skills/${skill.id}/`);
    }
  }

  return written;
}
