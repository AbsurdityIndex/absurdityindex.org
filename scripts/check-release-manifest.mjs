#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  CI_COMMIT_SHA_TOKEN,
  defaultManifestPath,
  readReleaseManifest,
  resolveCommitSha,
  validateReleaseManifest,
} from './release-manifest-lib.mjs';

const args = new Set(process.argv.slice(2));
const manifestPath = defaultManifestPath();
const verifyRemote = args.has('--verify-remote');

function fail(message) {
  console.error(`release-manifest: ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`release-manifest: ${message}`);
}

function verifyCommitExists(repo, sha) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-check-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tempDir, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['remote', 'add', 'origin', repo], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('git', ['fetch', '--depth', '1', 'origin', sha], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const manifest = readReleaseManifest(manifestPath);
  const { errors } = validateReleaseManifest(manifest);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`release-manifest: ${error}`);
    }
    process.exit(1);
  }

  const components = manifest.components;

  if (verifyRemote) {
    for (const [name, component] of Object.entries(components)) {
      if (name === 'absurdityindex') {
        // CI_COMMIT_SHA may be an ephemeral merge commit in CI and may not be reachable
        // via ls-remote at validation time; we verify external components only.
        continue;
      }

      const resolvedSha = resolveCommitSha(component.sha);
      if (!resolvedSha) {
        fail(
          `components.${name}.sha is ${CI_COMMIT_SHA_TOKEN} but CI_COMMIT_SHA is not set in the environment`,
        );
      }

      if (!verifyCommitExists(component.repo, resolvedSha)) {
        fail(`could not verify commit ${resolvedSha} for ${name} at ${component.repo}`);
      }
    }
  }

  const votechainSha = components.votechain.sha;
  const siteSha = components.absurdityindex.sha;
  info(`manifest OK (${manifestPath})`);
  info(`absurdityindex sha: ${siteSha}`);
  info(`votechain sha: ${votechainSha}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
}
