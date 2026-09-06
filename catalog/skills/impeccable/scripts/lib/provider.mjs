// Adapted by open-agent-config from skill-v4.1.2 for shared Claude/Codex bundles.
import { fileURLToPath } from 'node:url';
const codex = fileURLToPath(import.meta.url).replaceAll('\\', '/').includes('/.agents/skills/');
export const IMPECCABLE_COMMAND_PREFIX = codex ? '$' : '/';
export const IMPECCABLE_PROVIDER_ID = codex ? 'agents' : 'claude-code';
export const IMPECCABLE_COMMAND = `${IMPECCABLE_COMMAND_PREFIX}impeccable`;
