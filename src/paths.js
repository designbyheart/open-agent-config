import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the orby-agent-config package (where catalog/, bin/, package.json live). */
export const PKG_ROOT = path.resolve(__dirname, '..');
