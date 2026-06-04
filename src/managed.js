/**
 * Managed-block helpers. Generated content lives between markers so re-running
 * `sync` only rewrites the managed region and preserves any hand edits outside.
 */

export const START = '<!-- oac:start -->';
export const END = '<!-- oac:end -->';
const AUTOGEN_NOTE =
  '<!-- Managed by orby-agent-config. Edit catalog rules, then run `oac sync`. Manual edits inside this block are overwritten. -->';

/** Wrap rendered body in start/end markers. */
export function wrap(body) {
  return `${START}\n${AUTOGEN_NOTE}\n\n${body.trim()}\n\n${END}\n`;
}

/** Does the file already contain a managed block? */
export function hasBlock(text) {
  return text.includes(START) && text.includes(END);
}

/**
 * Insert or replace the managed block within `existing`. When there is no
 * existing file the wrapped block is returned as-is. When a non-managed file
 * exists, the block is appended below the existing content (preserved).
 */
export function upsert(existing, body) {
  const block = wrap(body);
  if (existing == null || existing === '') return block;
  if (hasBlock(existing)) {
    const before = existing.slice(0, existing.indexOf(START));
    const after = existing.slice(existing.indexOf(END) + END.length);
    return `${before}${block.trim()}${after.startsWith('\n') ? after : '\n' + after}`;
  }
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${block}`;
}

/** Extract just the managed body (between markers), or null. */
export function extractBody(text) {
  if (!hasBlock(text)) return null;
  const start = text.indexOf(START) + START.length;
  const end = text.indexOf(END);
  return text.slice(start, end).trim();
}
