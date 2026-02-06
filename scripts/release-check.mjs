#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const shouldRunVerify = !args.has('--skip-verify');
const allowDirty = args.has('--allow-dirty');
const requireSignedHead = args.has('--require-signed-head');

function detectRepoRoot() {
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

const repoRoot = detectRepoRoot();

function run(command, options = {}) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`release-check: ${message}`);
}

function warn(message) {
  console.log(`release-check: warning: ${message}`);
}

function isValidSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function ensureGitRepo() {
  try {
    const inside = run('git rev-parse --is-inside-work-tree');
    if (inside !== 'true') {
      fail('not inside a git repository');
    }
  } catch {
    fail('not inside a git repository');
  }
}

function ensureBranchIsMain() {
  const branch = run('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    fail(`release must be prepared from 'main' (current: '${branch}')`);
  }
}

function ensureCleanTree() {
  if (allowDirty) {
    warn('skipping clean-tree check because --allow-dirty was provided');
    return;
  }

  const status = run('git status --porcelain');
  if (status.length > 0) {
    fail('working tree is not clean; commit or stash changes first');
  }
}

function ensureVersionsAreValid() {
  const rootPackage = readJson(path.join(repoRoot, 'package.json'));
  const cliPackage = readJson(path.join(repoRoot, 'cli/package.json'));

  if (!isValidSemver(rootPackage.version)) {
    fail(`invalid semver in package.json: ${rootPackage.version}`);
  }

  if (!isValidSemver(cliPackage.version)) {
    fail(`invalid semver in cli/package.json: ${cliPackage.version}`);
  }
}

function ensureChangelogShape() {
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    fail('CHANGELOG.md is missing');
  }

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  if (!changelog.includes('## [Unreleased]')) {
    fail("CHANGELOG.md must include an 'Unreleased' section");
  }
}

function checkHeadSignature() {
  const signatureStatus = run('git log -1 --pretty=%G?');
  if (signatureStatus === 'G' || signatureStatus === 'U') {
    info('HEAD commit is signed and verified by git');
    return;
  }

  const message =
    'HEAD commit is not verified as signed. Enforce signed commits in GitHub branch protection.';
  if (requireSignedHead) {
    fail(message);
  }
  warn(message);
}

function runVerifyIfNeeded() {
  if (!shouldRunVerify) {
    warn('skipping npm run verify because --skip-verify was provided');
    return;
  }

  info('running npm run verify...');
  execSync('npm run verify', { cwd: repoRoot, stdio: 'inherit' });
}

function main() {
  ensureGitRepo();
  ensureBranchIsMain();
  ensureCleanTree();
  ensureVersionsAreValid();
  ensureChangelogShape();
  checkHeadSignature();
  runVerifyIfNeeded();
  info('all release checks passed');
}

main();
