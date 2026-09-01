import { loadRules, loadStacks, loadSkills } from './catalog.js';
import { readProjectPatterns } from './patterns.js';

/**
 * Byte budget for a generated agent instruction document.
 *
 * Codex sums every project doc it discovers against `project_doc_max_bytes`
 * (default 32 KiB) and then simply stops reading — no warning, no error, the
 * rest of the file is silently dropped. Other AGENTS.md consumers apply similar
 * caps. Anything we emit past this point is guidance the tool never sees, so we
 * budget for it explicitly instead of writing a megabyte and hoping.
 *
 * @see https://learn.chatgpt.com/docs/agent-configuration/agents-md
 */
export const AGENT_DOC_BUDGET_BYTES = 32768;

/** Headroom for a target's own wrapper: title, blurb, managed-block markers. */
export const DOC_WRAPPER_ALLOWANCE_BYTES = 1024;

/** Byte length of a string as it will actually be written to disk. */
export function docBytes(text) {
  return Buffer.byteLength(text || '', 'utf8');
}

/** Strip a single leading `# H1` line from a fragment body. */
function stripH1(body) {
  return body.replace(/^#\s+.*\n+/, '').trim();
}

/**
 * Shift every markdown heading down by `levels`, leaving fenced code blocks
 * untouched (so `# comment` lines inside bash/python snippets aren't mangled).
 */
function demoteHeadings(md, levels = 1) {
  const lines = md.split('\n');
  let inFence = false;
  let fenceChar = '';
  return lines
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        const ch = fence[1][0];
        if (!inFence) {
          inFence = true;
          fenceChar = ch;
        } else if (ch === fenceChar) {
          inFence = false;
          fenceChar = '';
        }
        return line;
      }
      if (inFence) return line;
      const h = line.match(/^(#{1,6})(\s)/);
      if (!h) return line;
      return '#'.repeat(Math.min(6, h[1].length + levels)) + line.slice(h[1].length);
    })
    .join('\n');
}

/**
 * Assemble the canonical instruction document from the manifest. Every target
 * renders from THIS so the rules are identical across tools — only the wrapper
 * (frontmatter, filename, skills handling) differs per target.
 */
export function assemble(manifest, { projectDir } = {}) {
  const projectName = manifest.project?.name || 'Project';
  const description = manifest.project?.description || '';
  const sections = [];

  // Project overview (optional)
  if (description || manifest.project?.sections?.overview) {
    const overview = manifest.project?.sections?.overview;
    sections.push({
      title: `Project: ${projectName}`,
      md: [description, overview].filter(Boolean).join('\n\n'),
    });
  }

  // Base rule fragments, in catalog order, demoted to H2 sections.
  for (const rule of loadRules()) {
    sections.push({ title: rule.title, md: `## ${rule.title}\n\n${stripH1(rule.body)}` });
  }

  // Project-owned communication patterns (.oac/communication-patterns.md),
  // placed next to the rules it refines.
  const patterns = readProjectPatterns(projectDir);
  if (patterns) {
    sections.push({ title: patterns.title, md: `## ${patterns.title}\n\n${stripH1(patterns.body)}` });
  }

  // Selected stack fragments (already authored as H2).
  const stackById = new Map(loadStacks().map((s) => [s.id, s]));
  for (const id of manifest.stacks || []) {
    const stack = stackById.get(id);
    if (stack) sections.push({ title: stack.label, md: stack.body });
  }

  // Project-specific commands (build/test/lint) if captured.
  const cmds = manifest.project?.sections?.commands;
  if (cmds && Object.values(cmds).some(Boolean)) {
    const lines = Object.entries(cmds)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k.padEnd(10)} ${v}`)
      .join('\n');
    sections.push({ title: 'Project Commands', md: `## Project Commands\n\nRun before finishing:\n\n\`\`\`\n${lines}\n\`\`\`` });
  }

  // Skills reference.
  const allSkills = new Map(loadSkills().map((s) => [s.id, s]));
  const selectedSkills = (manifest.skills || []).map((id) => allSkills.get(id)).filter(Boolean);

  return { projectName, description, sections, selectedSkills };
}

/** Render the canonical section list to a markdown body (no top H1, no markers). */
export function renderSections(sections) {
  return sections.map((s) => s.md.trim()).join('\n\n---\n\n');
}

/**
 * Skills section. For Claude the skills are physically installed in
 * `.claude/skills/`; for other tools they're listed as reference playbooks.
 */
export function renderSkills(
  selectedSkills,
  { installed, skillsDir = '.claude/skills', budget = Infinity } = {}
) {
  if (!selectedSkills.length) return '';
  const intro = installed
    ? `These skills are installed in \`${skillsDir}/\` and load on demand:`
    : `Reference playbooks for this project (full text in \`${skillsDir}/\` if present):`;
  const build = (clamped) => `## Skills\n\n${intro}\n\n${skillIndexRows(selectedSkills, { clamped })}`;

  // Descriptions and triggers are the whole routing signal for whether to load
  // a skill, so keep them verbatim while there is room. Only a selection large
  // enough to threaten the budget gets abbreviated — at ~370 characters each,
  // fifty of them cost 17 KiB, over half the document.
  const full = build(false);
  return docBytes(full) <= budget ? full : build(true);
}

/**
 * How much of a skill's description and trigger an abbreviated index row may
 * carry. Full descriptions run to ~370 characters, so an unclamped index for
 * fifty skills costs ~17 KiB, over half the agent-doc budget. Clamping is
 * applied only under real pressure — always on the overflow path, and on the
 * installed-skills index only when the verbatim version would not fit.
 */
const INDEX_DESC_CHARS = 120;
const INDEX_TRIGGER_CHARS = 80;

/**
 * Trim to at most `max` characters, cutting on a word boundary and never
 * inside an astral character. Slicing a JS string by code units splits
 * surrogate pairs, and the lone half becomes U+FFFD once written — emoji in a
 * third-party skill description would be silently corrupted.
 */
function clamp(text, max) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  if (chars.length <= max) return t;
  const cut = chars.slice(0, max - 1).join('');
  const lastSpace = cut.lastIndexOf(' ');
  // Only back up to a word boundary if it does not throw away most of the text.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/** One line per skill: name, description, trigger. The cheap form. */
function skillIndexRows(skills, { clamped = false } = {}) {
  return skills
    .map((s) => {
      const desc = clamped ? clamp(s.description, INDEX_DESC_CHARS) : s.description;
      const rawTrigger = clamped ? clamp(s.trigger, INDEX_TRIGGER_CHARS) : s.trigger;
      return `- **${s.name}** — ${desc}${s.trigger ? ` _(trigger: ${rawTrigger})_` : ''}`;
    })
    .join('\n');
}

/** The full inlined block for one skill: body plus any bundled markdown. */
function renderInlineBlock(s) {
  const meta = [];
  if (s.trigger) meta.push(`_When to use: ${s.trigger}_`);
  else if (s.description) meta.push(`_${s.description}_`);
  if (s.hasNonDocExtras) {
    meta.push(
      '_Note: this skill also ships non-text files (e.g. scripts, assets) that travel only ' +
        'with a Claude Code install; they are not inlined here._'
    );
  }
  const out = [`### ${s.name}`, meta.join('\n\n'), demoteHeadings(stripH1(s.body || ''), 2)];

  // Bundled markdown the skill refers to by path — inline it under matching
  // headings so the reference resolves for tools that can't open the files.
  const docs = s.extraDocs || [];
  if (docs.length) {
    out.push(
      '_Bundled reference files (the playbook above refers to these by path; their full text follows):_'
    );
    for (const doc of docs) {
      out.push(`#### \`${doc.path}\`\n\n${demoteHeadings(stripH1(doc.body), 3)}`);
    }
  }
  return out.filter(Boolean).join('\n\n').trim();
}

/**
 * Inline full skill playbooks for tools that can't physically load a skills
 * directory (Cursor, Copilot, Windsurf, Devin). Each skill's SKILL.md body is
 * embedded — H1 stripped, inner headings demoted to nest under the skill's
 * `###` heading — so the guidance actually reaches the tool instead of being a
 * dangling reference to files it can't open.
 *
 * `budget` caps the bytes this section may occupy. Skills are inlined in order
 * until the next one would not fit; the remainder is listed as an index instead
 * of being emitted past the point the tool stops reading. Without a budget the
 * whole catalog is inlined, which is only safe for a doc nothing truncates.
 *
 * The index is the irreducible floor: naming every selected skill costs what it
 * costs, so a budget too small to hold even that is exceeded rather than
 * silently dropping skills from the list. `oversizeWarnings` catches the
 * resulting document, which is the honest outcome — the fix there is fewer
 * skills or a target that installs them, not a quieter renderer.
 */
export function renderSkillsInline(selectedSkills, { budget = Infinity } = {}) {
  if (!selectedSkills.length) return '';
  const intro =
    'The following project skills are inlined so this tool can apply them directly. ' +
    'Each is a self-contained playbook — use it when its trigger matches.';
  const blocks = selectedSkills.map((s) => ({ skill: s, md: renderInlineBlock(s) }));
  const header = `## Skills\n\n${intro}\n\n`;
  const JOIN = '\n\n---\n\n';

  if (budget === Infinity) {
    return header + blocks.map((b) => b.md).join(JOIN);
  }

  // Decide what fits smallest-first: a single 40 KiB playbook early in the
  // list would otherwise consume the whole budget and push a dozen small ones
  // that would all have fitted into the index. Output stays in catalog order —
  // only the fit decision is reordered.
  const bySize = [...blocks].sort((a, b) => docBytes(a.md) - docBytes(b.md));
  const keep = new Set();
  const deferred = [];
  let used = docBytes(header);

  for (let i = 0; i < bySize.length; i++) {
    const b = bySize[i];
    const cost = docBytes(b.md) + (keep.size ? docBytes(JOIN) : 0);
    // Upper bound on the index we may still have to write if this one is
    // inlined: everything already deferred, plus — worst case — everything not
    // yet considered. Reserving against only what can still land in the index,
    // rather than against the whole selection, is what keeps a long skill list
    // from crowding out every body and inlining nothing at all.
    const worstCaseIndex = indexCost([...deferred, ...bySize.slice(i + 1).map((x) => x.skill)]);
    if (used + cost + worstCaseIndex <= budget) {
      keep.add(b);
      used += cost;
    } else {
      deferred.push(b.skill);
    }
  }

  const inlined = blocks.filter((b) => keep.has(b));
  const overflow = blocks.filter((b) => !keep.has(b)).map((b) => b.skill);

  if (!overflow.length) return header + inlined.map((b) => b.md).join(JOIN);

  const parts = [header.trimEnd()];
  if (inlined.length) parts.push(inlined.map((b) => b.md).join(JOIN));
  parts.push(overflowSection(overflow));
  return parts.join('\n\n');
}

/** Bytes the overflow index costs when appended to a section, 0 for none. */
function indexCost(skills) {
  return skills.length ? docBytes('\n\n' + overflowSection(skills)) : 0;
}

/**
 * Index for skills that did not fit the byte budget. They are named rather than
 * embedded so the agent knows they exist and can ask for them, instead of the
 * guidance vanishing into a truncated tail.
 */
function overflowSection(skills) {
  return [
    '### Skills not inlined here',
    '_These are selected for this project but exceeded the byte budget for this file. ' +
      'Descriptions are abbreviated; ask for one by name before working in its area and ' +
      'it can be supplied in full._',
    skillIndexRows(skills, { clamped: true }),
  ].join('\n\n');
}
