import path from 'node:path';
import fs from 'node:fs';
import { exists, readText, writeText, rmrf } from './fsutil.js';

export const MANIFEST_NAME = 'agent.config.json';
/** Manifest names written by earlier versions; still read for backward compatibility. */
export const LEGACY_MANIFEST_NAMES = ['orby-agent.config.json'];
export const SCHEMA_VERSION = 1;

/** Where a manifest is written. Always the current name. */
export function manifestPath(projectDir) {
  return path.join(projectDir, MANIFEST_NAME);
}

/**
 * Where a manifest is read from: the current name when present, otherwise a
 * name written by an earlier version. Returns the current path when neither
 * exists, so callers can report the expected filename.
 */
export function manifestReadPath(projectDir) {
  const current = manifestPath(projectDir);
  if (exists(current)) return current;
  for (const legacy of LEGACY_MANIFEST_NAMES) {
    const legacyPath = path.join(projectDir, legacy);
    if (exists(legacyPath)) return legacyPath;
  }
  return current;
}

export function manifestExists(projectDir) {
  return exists(manifestReadPath(projectDir));
}

export function readManifest(projectDir) {
  const p = manifestReadPath(projectDir);
  if (!exists(p)) return null;
  try {
    return JSON.parse(readText(p));
  } catch (err) {
    throw new Error(`${MANIFEST_NAME} is not valid JSON: ${err.message}`);
  }
}

/** Build a fresh manifest object from user selections. */
export function makeManifest({
  project = {},
  targets = [],
  skills = [],
  stacks = [],
  ollama = { models: [], apps: [] },
  skillsOnly = false,
  patterns = true,
  sourceHash,
  cliVersion,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      name: project.name || path.basename(process.cwd()),
      description: project.description || '',
      sections: project.sections || {},
    },
    // When true, oac installs skills + manifest only and never writes/modifies
    // rule files (AGENTS.md, CLAUDE.md, …). Used to add skills to a repo that
    // already maintains its own agent config.
    skillsOnly,
    // When false, oac never scaffolds `.oac/communication-patterns.md`. An
    // existing file is still inlined — opting out stops creation, not use.
    patterns,
    targets,
    skills,
    stacks,
    ollama: { models: ollama.models || [], apps: ollama.apps || [] },
    sourceHash: sourceHash || null,
    cliVersion: cliVersion || null,
    generatedAt: new Date().toISOString(),
  };
}

export function writeManifest(projectDir, manifest) {
  writeText(manifestPath(projectDir), JSON.stringify(manifest, null, 2) + '\n');
  // Migration: a project initialised by an older version keeps its manifest
  // under the previous name. Once the current one is written, drop the old.
  for (const legacy of LEGACY_MANIFEST_NAMES) {
    const legacyPath = path.join(projectDir, legacy);
    if (exists(legacyPath)) rmrf(legacyPath);
  }
}
