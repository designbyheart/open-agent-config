import claude from './claude.js';
import codex from './codex.js';
import cursor from './cursor.js';
import copilot from './copilot.js';
import windsurf from './windsurf.js';
import devin from './devin.js';
import ollama from './ollama.js';
import { assemble, renderSections, renderSkills } from '../generate.js';

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
export function buildArtifacts(manifest) {
  const doc = assemble(manifest);
  const sectionsMd = renderSections(doc.sections);
  const ids = manifest.targets || [];
  const claudeSelected = ids.includes('claude');

  const artifacts = [];
  const seenPaths = new Set();
  for (const id of ids) {
    const target = BY_ID.get(id);
    if (!target) continue;
    // Skills are physically installed only for Claude; everyone else gets a
    // reference list. If Claude isn't selected, no skills are installed so the
    // reference wording still points at where they'd live.
    const skillsMd = renderSkills(doc.selectedSkills, { installed: target.supportsSkills });
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
