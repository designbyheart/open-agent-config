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

/** Where skills go when nothing else claims them (skills-only, no skill target). */
export const DEFAULT_SKILLS_DIR = '.claude/skills';

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
  const seenPaths = new Map();
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
      const built = { targetId: id, ...a, bytes: docBytes(a.body ?? a.content) };
      // Dedupe shared outputs (e.g. Codex + Devin both write AGENTS.md). When
      // they collide, the skills-loading target wins regardless of the order
      // the user listed targets in — otherwise `--targets devin,codex` would
      // hand Codex an AGENTS.md with every skill inlined while its own
      // `.codex/skills/` sat installed and unmentioned.
      const seenAt = seenPaths.get(a.path);
      if (seenAt !== undefined) {
        if (target.supportsSkills && !BY_ID.get(artifacts[seenAt].targetId)?.supportsSkills) {
          artifacts[seenAt] = built;
        }
        continue;
      }
      seenPaths.set(a.path, artifacts.length);
      artifacts.push(built);
    }
  }

  return { artifacts, doc, claudeSelected, skillTargets, warnings: oversizeWarnings(artifacts) };
}

/**
 * Every skills directory the manifest's targets load from. Skills-only mode
 * with no skill-capable target falls back to Claude's, matching the behavior
 * before Codex gained a directory of its own. Single source of truth for
 * apply, doctor, and remove-skill, so an install can never outlive its removal.
 */
export function skillDirsFor(manifest) {
  const dirs = (manifest.targets || [])
    .map((id) => BY_ID.get(id))
    .filter((t) => t && t.supportsSkills && t.skillsDir)
    .map((t) => t.skillsDir);
  if (!dirs.length && manifest.skillsOnly) dirs.push(DEFAULT_SKILLS_DIR);
  return [...new Set(dirs)];
}

/**
 * The warning for one instruction file that its consumer will silently
 * truncate, or null when it fits. Takes bytes rather than an artifact so
 * callers can measure the finished file on disk — which includes the managed
 * block markers and any hand-written content above them, and is therefore the
 * number that actually decides what the tool reads.
 */
export function budgetWarning(relPath, bytes) {
  if (bytes <= AGENT_DOC_BUDGET_BYTES) return null;
  return (
    `${relPath} is ${(bytes / 1024).toFixed(1)} KiB, over the ${AGENT_DOC_BUDGET_BYTES / 1024} KiB ` +
    'agent-doc budget. Codex and similar tools stop reading at that point without warning, so the ' +
    'tail is ignored. Trim rules, shorten hand-written content in the file, or select fewer skills.'
  );
}

/**
 * Flag generated instruction docs that are already over budget before anything
 * else is added to the file. `budgeted` marks the artifacts their target reads
 * wholesale, so a Cursor `.mdc` is checked even though it is written raw.
 */
export function oversizeWarnings(artifacts) {
  return artifacts
    .filter((a) => a.budgeted)
    .map((a) => budgetWarning(a.path, a.bytes))
    .filter(Boolean);
}
