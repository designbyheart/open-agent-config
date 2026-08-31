import claude from './claude.js';
import codex from './codex.js';
import cursor from './cursor.js';
import copilot from './copilot.js';
import windsurf from './windsurf.js';
import devin from './devin.js';
import ollama from './ollama.js';
import {
  assemble,
  renderSections,
  renderSkills,
  renderSkillsInline,
  docBytes,
  AGENT_DOC_BUDGET_BYTES,
  DOC_WRAPPER_ALLOWANCE_BYTES,
} from '../generate.js';

/** Never squeeze the inline skills section below this, even on a fat rule set. */
const MIN_INLINE_BUDGET_BYTES = 2048;

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

  // Targets that load SKILL.md folders natively — each gets its own skills dir
  // populated on apply, and only a short index in its config file.
  const skillTargets = ids
    .map((id) => BY_ID.get(id))
    .filter((t) => t && t.supportsSkills && t.skillsDir);

  // What's left for an inlined skills section after the rules have had their
  // share of the document budget.
  const inlineBudget = Math.max(
    MIN_INLINE_BUDGET_BYTES,
    AGENT_DOC_BUDGET_BYTES - docBytes(sectionsMd) - DOC_WRAPPER_ALLOWANCE_BYTES
  );

  const artifacts = [];
  const seenPaths = new Set();
  for (const id of ids) {
    const target = BY_ID.get(id);
    if (!target) continue;
    // Claude and Codex physically install skills and load them on demand, so
    // they only need a short reference list. Tools that read a single config
    // file (Cursor, Copilot, Windsurf, Devin) can't open those files, so the
    // playbooks are inlined for them instead — within the byte budget.
    const skillsMd = target.supportsSkills
      ? renderSkills(doc.selectedSkills, { installed: true, skillsDir: target.skillsDir })
      : renderSkillsInline(doc.selectedSkills, { budget: inlineBudget });
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
      artifacts.push({ targetId: id, ...a, bytes: docBytes(a.body ?? a.content) });
    }
  }

  return { artifacts, doc, claudeSelected, skillTargets, warnings: oversizeWarnings(artifacts) };
}

/**
 * Flag instruction docs that will be silently truncated by their consumer.
 * The rule set alone can blow the budget, so this is checked on the finished
 * artifact rather than only on the skills section.
 */
export function oversizeWarnings(artifacts) {
  return artifacts
    .filter((a) => a.type === 'doc' && a.bytes > AGENT_DOC_BUDGET_BYTES)
    .map(
      (a) =>
        `${a.path} is ${(a.bytes / 1024).toFixed(1)} KiB, over the ${
          AGENT_DOC_BUDGET_BYTES / 1024
        } KiB agent-doc budget. Codex and similar tools stop reading at that point without warning, so the tail is ignored. Trim rules or move skills to a target that installs them natively.`
    );
}
