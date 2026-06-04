import path from 'node:path';
import fs from 'node:fs';
import { exists, readText, writeText } from './fsutil.js';

export const MANIFEST_NAME = 'orby-agent.config.json';
export const SCHEMA_VERSION = 1;

export function manifestPath(projectDir) {
  return path.join(projectDir, MANIFEST_NAME);
}

export function manifestExists(projectDir) {
  return exists(manifestPath(projectDir));
}

export function readManifest(projectDir) {
  const p = manifestPath(projectDir);
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
}
