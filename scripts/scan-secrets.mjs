#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

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

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.zip',
  '.gz',
]);

const ALLOWLIST_MARKERS = ['codex:allow-secret', 'gitleaks:allow'];

const PATTERNS = [
  {
    name: 'Private key block',
    regex: /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP|PRIVATE) KEY-----/,
  },
  {
    name: 'GitHub token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: 'GitHub fine-grained token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: 'AWS access key',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    name: 'Generic secret assignment',
    regex:
      /\b(?:api[_-]?key|token|secret|password|private[_-]?key)\b\s*[:=]\s*["'](?<value>[A-Za-z0-9+/_=.-]{20,})["']/i,
    evaluate(match) {
      const value = match.groups?.value ?? '';
      if (!value) return false;

      // Skip obvious env references and placeholders.
      if (/^\$?\{?[A-Z0-9_]+\}?$/.test(value)) return false;
      if (/^(?:your|example|dummy|test|sample|placeholder|changeme)[A-Za-z0-9._-]*$/i.test(value))
        return false;

      return true;
    },
  },
];

function shouldSkipFile(file) {
  const ext = path.extname(file).toLowerCase();
  return SKIP_EXTENSIONS.has(ext);
}

function isLikelyBinary(text) {
  return text.includes('\u0000');
}

function getTrackedFiles() {
  const output = execSync('git ls-files -z', { cwd: repoRoot, encoding: 'utf8' });
  return output.split('\u0000').filter(Boolean);
}

function scanFile(filePath) {
  const findings = [];

  if (shouldSkipFile(filePath)) {
    return findings;
  }

  const absolutePath = path.join(repoRoot, filePath);
  let content;

  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return findings;
  }

  if (isLikelyBinary(content)) {
    return findings;
  }

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (ALLOWLIST_MARKERS.some((marker) => line.includes(marker))) {
      return;
    }

    PATTERNS.forEach((pattern) => {
      const match = line.match(pattern.regex);
      if (!match) return;
      if (typeof pattern.evaluate === 'function' && !pattern.evaluate(match, line, filePath)) {
        return;
      }

      findings.push({
        file: filePath,
        line: index + 1,
        type: pattern.name,
        text: line.trim().slice(0, 160),
      });
    });
  });

  return findings;
}

function main() {
  const files = getTrackedFiles();
  const findings = files.flatMap(scanFile);

  if (findings.length > 0) {
    console.error('Potential secrets detected:');
    findings.forEach((finding) => {
      console.error(`- ${finding.file}:${finding.line} [${finding.type}] ${finding.text}`);
    });
    process.exit(1);
  }

  console.log(
    `Secret scan passed: ${files.length} tracked files checked, no potential secrets detected.`,
  );
}

main();
