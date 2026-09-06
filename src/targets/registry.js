import path from 'node:path';
import { exists, readText } from '../fsutil.js';
import { upsert } from '../managed.js';
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

  const artifacts = [];
  const seenPaths = new Map();
  for (const id of ids) {
    const target = BY_ID.get(id);
    if (!target) continue;
    const render = (skillsMd) => target.render({
      projectName: doc.projectName,
      description: doc.description,
      sectionsMd,
      skillsMd,
      manifest,
    });
    // Reserve each target's existing user text and actual wrapper before skills.
    const budgets = render('').filter((a) => a.budgeted).map((a) => {
      const file = projectDir && path.join(projectDir, a.path);
      const existing = file && exists(file) ? readText(file) : '';
      let base = a.type === 'doc' ? upsert(existing, a.body) : a.content;
      base = base.replace(/\r\n/g, '\n');
      if (existing.includes('\r\n')) base = base.replace(/\n/g, '\r\n');
      return AGENT_DOC_BUDGET_BYTES - docBytes(base) - DOC_WRAPPER_ALLOWANCE_BYTES;
    });
    const budget = Math.max(0, Math.min(AGENT_DOC_BUDGET_BYTES, ...budgets));
    const skillsMd = target.supportsSkills
      ? renderSkills(doc.selectedSkills, { installed: true, skillsDir: target.skillsDir, budget })
      : renderSkillsInline(doc.selectedSkills, { budget });
    const rendered = render(skillsMd);
    for (const a of rendered) {
      const built = { targetId: id, ...a, bytes: docBytes(a.body ?? a.content) };
      // Dedupe shared outputs (e.g. Codex + Devin both write AGENTS.md). When
      // they collide, the skills-loading target wins regardless of the order
      // the user listed targets in — otherwise `--targets devin,codex` would
      // hand Codex an AGENTS.md with every skill inlined while its own
      // `.agents/skills/` sat installed and unmentioned.
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

  // Deliberately no `warnings` here: the only honest size for an instruction
  // file is the one measured after it is written, since hand-written content
  // above the managed block counts too. Callers use `budgetWarning` on the
  // finished bytes — see applyManifest and cmdDoctor.
  return { artifacts, doc };
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


