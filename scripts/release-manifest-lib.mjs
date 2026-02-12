import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const CI_COMMIT_SHA_TOKEN = '$CI_COMMIT_SHA';
const SHA_1_HEX_RE = /^[0-9a-f]{40}$/;
const GITHUB_REPO_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;

export function detectRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

export function defaultManifestPath(repoRoot = detectRepoRoot()) {
  return path.join(repoRoot, 'deploy', 'release-manifest.json');
}

export function readReleaseManifest(filePath = defaultManifestPath()) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read release manifest at ${filePath}: ${message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Release manifest is not valid JSON (${filePath}): ${message}`);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeShaToken(sha) {
  if (typeof sha !== 'string') return null;
  return sha.trim();
}

export function resolveCommitSha(rawSha, ciCommitSha = process.env.CI_COMMIT_SHA) {
  const normalized = normalizeShaToken(rawSha);
  if (!normalized) return null;
  if (normalized === CI_COMMIT_SHA_TOKEN) {
    return isNonEmptyString(ciCommitSha) ? ciCommitSha.trim() : null;
  }
  return normalized;
}

function validateComponent(name, component, errors) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    errors.push(`components.${name} must be an object`);
    return;
  }

  if (!isNonEmptyString(component.repo) || !GITHUB_REPO_URL_RE.test(component.repo.trim())) {
    errors.push(`components.${name}.repo must be an https GitHub URL`);
  }

  if (!isNonEmptyString(component.cloudflareProject)) {
    errors.push(`components.${name}.cloudflareProject must be a non-empty string`);
  }

  if (!isNonEmptyString(component.deployDir)) {
    errors.push(`components.${name}.deployDir must be a non-empty string`);
  } else if (path.isAbsolute(component.deployDir)) {
    errors.push(`components.${name}.deployDir must be a repo-relative path`);
  }

  const rawSha = normalizeShaToken(component.sha);
  if (!rawSha) {
    errors.push(`components.${name}.sha must be a non-empty string`);
    return;
  }

  if (name === 'absurdityindex') {
    if (rawSha === CI_COMMIT_SHA_TOKEN) return;
    if (!SHA_1_HEX_RE.test(rawSha)) {
      errors.push(
        `components.${name}.sha must be a 40-char lowercase git SHA or ${CI_COMMIT_SHA_TOKEN}`,
      );
    }
    return;
  }

  if (!SHA_1_HEX_RE.test(rawSha)) {
    errors.push(`components.${name}.sha must be a 40-char lowercase git SHA`);
  }
}

export function validateReleaseManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { errors: ['manifest root must be an object'] };
  }

  if (manifest.version !== 1) {
    errors.push('manifest.version must be 1');
  }

  if (!isNonEmptyString(manifest.releaseTrain)) {
    errors.push('manifest.releaseTrain must be a non-empty string');
  }

  const components = manifest.components;
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    errors.push('manifest.components must be an object');
    return { errors };
  }

  for (const required of ['absurdityindex', 'votechain']) {
    if (!(required in components)) {
      errors.push(`manifest.components.${required} is required`);
    }
  }

  if ('absurdityindex' in components) {
    validateComponent('absurdityindex', components.absurdityindex, errors);
  }
  if ('votechain' in components) {
    validateComponent('votechain', components.votechain, errors);
  }

  return { errors };
}
