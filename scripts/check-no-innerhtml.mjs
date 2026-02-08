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

// Keep this check focused on the public-facing site code.
// The CLI dashboard uses HTML templating intentionally and is handled separately.
const INCLUDED_DIR_PREFIXES = ['src' + path.sep, 'public' + path.sep];

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.zip',
  '.gz',
  '.mp3',
  '.mp4',
  '.mov',
]);

function isLikelyBinary(text) {
  return text.includes('\u0000');
}

function shouldScanFile(file) {
  const rel = file.replaceAll('/', path.sep);
  if (!INCLUDED_DIR_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return false;
  return true;
}

function getTrackedFiles() {
  try {
    const output = execSync('git ls-files -z', { cwd: repoRoot, encoding: 'utf8' });
    return output.split('\u0000').filter(Boolean);
  } catch {
    const out = [];
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else out.push(path.relative(repoRoot, p));
      }
    };
    walk(repoRoot);
    return out;
  }
}

function scanFile(file) {
  const abs = path.join(repoRoot, file);
  let text = '';
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  if (!text || isLikelyBinary(text)) return [];

  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes('innerHTML')) continue;

    // Ignore cases where the string "innerHTML" appears in documentation.
    // If we ever need an intentional exception, add it explicitly by file+line.
    findings.push({
      file,
      line: i + 1,
      snippet: line.trim().slice(0, 240),
    });
  }
  return findings;
}

const files = getTrackedFiles().filter(shouldScanFile);
const findings = [];

for (const file of files) {
  findings.push(...scanFile(file));
}

if (findings.length === 0) {
  process.exit(0);
}

console.error('Disallowed `.innerHTML` usage found in site code:');
for (const finding of findings) {
  console.error(`- ${finding.file}:${finding.line} ${finding.snippet}`);
}
process.exit(1);
