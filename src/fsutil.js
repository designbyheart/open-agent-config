import fs from 'node:fs';
import path from 'node:path';

/** Resolve the target project directory from --dir, default cwd. */
export function resolveProjectDir(flags = {}) {
  const dir = typeof flags.dir === 'string' ? flags.dir : process.cwd();
  return path.resolve(dir);
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

/**
 * Write text cross-platform. Normalizes to \n internally; if the existing file
 * uses CRLF, preserve it so we don't churn line endings on Windows checkouts.
 */
export function writeText(p, content) {
  ensureDir(path.dirname(p));
  let out = content.replace(/\r\n/g, '\n');
  if (exists(p)) {
    const prev = readText(p);
    if (prev.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(p, out);
}

/** Recursively copy a directory (Node >=16.7). */
export function copyDir(src, dest) {
  ensureDir(dest);
  fs.cpSync(src, dest, { recursive: true });
}

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** Best-effort chmod; a no-op on platforms/filesystems that don't support it (e.g. Windows). */
export function chmodSafe(p, mode) {
  try {
    fs.chmodSync(p, mode);
  } catch {
    /* ignore — Windows and some filesystems don't honor unix modes */
  }
}

export function listDirs(p) {
  if (!exists(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export function listFiles(p) {
  if (!exists(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
}
