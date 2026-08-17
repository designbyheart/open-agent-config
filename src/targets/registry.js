import claude from './claude.js';
import codex from './codex.js';
import cursor from './cursor.js';
import copilot from './copilot.js';
import windsurf from './windsurf.js';
import devin from './devin.js';
import ollama from './ollama.js';
import { assemble, renderSections, renderSkills, renderSkillsInline } from '../generate.js';

const TARGETS = [claude, codex, devin, cursor, copilot, windsurf, ollama];
const BY_ID = new Map(TARGETS.map((t) => [t.id, t]));

export function allTargets() {
  return TARGETS;
}

export function getTarget(id) {
  return BY_ID.get(id);
}

export function isKnownTarget(id) {
  return BY_ID.has(id);
}

/**
 * Produce every file artifact for the selected targets from one assembled doc.
 * Returns { artifacts: [{ targetId, path, type, body|content }], doc }.
 */
export function buildArtifacts(manifest, { projectDir } = {}) {
  const doc = assemble(manifest, { projectDir });
  const sectionsMd = renderSections(doc.sections);
  const ids = manifest.targets || [];
  const claudeSelected = ids.includes('claude');

  const artifacts = [];
  const seenPaths = new Set();
  for (const id of ids) {
    const target = BY_ID.get(id);
    if (!target) continue;
    // Claude physically installs skills into `.claude/skills/` and loads them
    // on demand, so it only needs a short reference list. Tools that read a
    // single config file (Cursor, Copilot, Codex, Windsurf, Devin) can't open
    // those files, so the full skill playbooks are inlined for them instead.
    const skillsMd = target.supportsSkills
      ? renderSkills(doc.selectedSkills, { installed: true })
      : renderSkillsInline(doc.selectedSkills);
    const rendered = target.render({
      projectName: doc.projectName,
      description: doc.description,
      sectionsMd,
      skillsMd,
      manifest,
    });
    for (const a of rendered) {
      // Dedupe shared outputs (e.g. Codex + Devin both write AGENTS.md).
      if (seenPaths.has(a.path)) continue;
      seenPaths.add(a.path);
      artifacts.push({ targetId: id, ...a });
    }
  }
  return { artifacts, doc, claudeSelected };
}
