#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  defaultManifestPath,
  readReleaseManifest,
  resolveCommitSha,
  validateReleaseManifest,
} from './release-manifest-lib.mjs';

const manifestPath = defaultManifestPath();
const DEFAULT_BRANCH = process.env.VOTECHAIN_DEPLOY_BRANCH || process.env.CI_COMMIT_BRANCH || 'main';

function fail(message) {
  console.error(`deploy-votechain: ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`deploy-votechain: ${message}`);
}

function run(command, args, options = {}) {
  const cwd = options.cwd || process.cwd();
  info(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
}

function ensureDirExists(dirPath, message) {
  if (!fs.existsSync(dirPath)) {
    fail(message);
  }
}

function deployVotechain() {
  const manifest = readReleaseManifest(manifestPath);
  const { errors } = validateReleaseManifest(manifest);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`deploy-votechain: ${error}`);
    }
    process.exit(1);
  }

  const votechain = manifest.components.votechain;
  const votechainSha = resolveCommitSha(votechain.sha);
  if (!votechainSha) {
    fail('votechain sha could not be resolved');
  }
  const deployProjectName = process.env.VOTECHAIN_PAGES_PROJECT || votechain.cloudflareProject;
  if (!deployProjectName || typeof deployProjectName !== 'string') {
    fail('missing target Cloudflare Pages project (set VOTECHAIN_PAGES_PROJECT or manifest value)');
  }

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'votechain-deploy-'));
  const repoDir = path.join(tempBase, 'repo');

  try {
    info(`cloning ${votechain.repo} at ${votechainSha}`);
    run('git', ['clone', '--filter=blob:none', '--no-checkout', votechain.repo, repoDir]);
    run('git', ['fetch', '--depth', '1', 'origin', votechainSha], { cwd: repoDir });
    run('git', ['checkout', '--detach', votechainSha], { cwd: repoDir });

    run('npm', ['ci'], { cwd: repoDir });
    run('npm', ['run', 'build'], { cwd: repoDir });

    const deployDir = path.join(repoDir, votechain.deployDir);
    ensureDirExists(deployDir, `build output directory not found: ${deployDir}`);

    run(
      'npx',
      [
        'wrangler',
        'pages',
        'deploy',
        votechain.deployDir,
        '--project-name',
        deployProjectName,
        '--branch',
        DEFAULT_BRANCH,
        '--commit-hash',
        votechainSha,
      ],
      { cwd: repoDir },
    );

    info(
      `successfully deployed votechain (${votechainSha}) to Cloudflare project ${deployProjectName}`,
    );
  } finally {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
}

try {
  deployVotechain();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
}
