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

// Skip obvious binary formats. We intentionally DO scan .svg because
// Unicode "icon" glyphs can sneak into SVG text nodes.
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.zip', '.gz',
  '.mp3', '.mp4', '.mov',
]);

function shouldSkipFile(file) {
  const ext = path.extname(file).toLowerCase();
  return SKIP_EXTENSIONS.has(ext);
}

function isLikelyBinary(text) {
  return text.includes('\u0000');
}

function getTrackedFiles() {
  try {
    const output = execSync('git ls-files -z', { cwd: repoRoot, encoding: 'utf8' });
    return output.split('\u0000').filter(Boolean);
  } catch {
    // Fallback: scan the working directory if git isn't available.
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

function isBannedCodePoint(cp) {
  // Variation selector used for emoji presentation.
  if (cp === 0xfe0f) return true;

  // Misc Symbols + Dingbats (includes many "icon-like" glyphs: stars, checkmarks, etc).
  if (cp >= 0x2600 && cp <= 0x27bf) return true;

  // Emoji/pictographs blocks commonly used for UI icons.
  if (cp >= 0x1f300 && cp <= 0x1faff) return true;

  return false;
}

function formatCodePoint(cp) {
  const hex = cp.toString(16).toUpperCase();
  return `U+${hex.padStart(4, '0')}`;
}

function sanitizeLine(line) {
  let out = '';
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    out += isBannedCodePoint(cp) ? `<${formatCodePoint(cp)}>` : ch;
  }
  return out;
}

function scanLineForUnicodeChars(line, file, lineNo) {
  const findings = [];
  let col = 0;
  for (const ch of line) {
    col += 1;
    const cp = ch.codePointAt(0);
    if (!isBannedCodePoint(cp)) continue;
    findings.push({
      file,
      line: lineNo,
      col,
      kind: 'unicode_char',
      codePoint: cp,
      detail: formatCodePoint(cp),
      snippet: sanitizeLine(line).slice(0, 220),
    });
  }
  return findings;
}

function scanLineForHtmlEntities(line, file, lineNo) {
  const findings = [];

  const dec = /&#(\d{1,7});/g;
  for (let m; (m = dec.exec(line));) {
    const cp = Number(m[1]);
    if (!Number.isFinite(cp) || !isBannedCodePoint(cp)) continue;
    findings.push({
      file,
      line: lineNo,
      col: (m.index ?? 0) + 1,
      kind: 'html_entity',
      codePoint: cp,
      detail: `${m[0]} => ${formatCodePoint(cp)}`,
      snippet: sanitizeLine(line).slice(0, 220),
    });
  }

  const hex = /&#x([0-9a-fA-F]{1,6});/g;
  for (let m; (m = hex.exec(line));) {
    const cp = parseInt(m[1], 16);
    if (!Number.isFinite(cp) || !isBannedCodePoint(cp)) continue;
    findings.push({
      file,
      line: lineNo,
      col: (m.index ?? 0) + 1,
      kind: 'html_entity',
      codePoint: cp,
      detail: `${m[0]} => ${formatCodePoint(cp)}`,
      snippet: sanitizeLine(line).slice(0, 220),
    });
  }

  // Named entities: keep this list intentionally small and focused.
  const named = [
    ['starf', 0x2605],
    ['star', 0x2606],
    ['check', 0x2713],
  ];

  for (const [name, cp] of named) {
    const needle = `&${name};`;
    let idx = line.indexOf(needle);
    while (idx !== -1) {
      findings.push({
        file,
        line: lineNo,
        col: idx + 1,
        kind: 'html_entity',
        codePoint: cp,
        detail: `${needle} => ${formatCodePoint(cp)}`,
        snippet: sanitizeLine(line).slice(0, 220),
      });
      idx = line.indexOf(needle, idx + needle.length);
    }
  }

  return findings;
}

function scanLineForJsUnicodeEscapes(line, file, lineNo) {
  const findings = [];

  // \u{1F4A1}
  const brace = /\\u\{([0-9a-fA-F]+)\}/g;
  for (let m; (m = brace.exec(line));) {
    const cp = parseInt(m[1], 16);
    if (!Number.isFinite(cp) || !isBannedCodePoint(cp)) continue;
    findings.push({
      file,
      line: lineNo,
      col: (m.index ?? 0) + 1,
      kind: 'js_escape',
      codePoint: cp,
      detail: `${m[0]} => ${formatCodePoint(cp)}`,
      snippet: sanitizeLine(line).slice(0, 220),
    });
  }

  // \u2713
  const u4 = /\\u([0-9a-fA-F]{4})/g;
  for (let m; (m = u4.exec(line));) {
    const cp = parseInt(m[1], 16);
    if (!Number.isFinite(cp) || !isBannedCodePoint(cp)) continue;
    findings.push({
      file,
      line: lineNo,
      col: (m.index ?? 0) + 1,
      kind: 'js_escape',
      codePoint: cp,
      detail: `${m[0]} => ${formatCodePoint(cp)}`,
      snippet: sanitizeLine(line).slice(0, 220),
    });
  }

  // Surrogate pairs: \uD83D\uDCA1
  const sur = /\\u(D[89ABab][0-9a-fA-F]{2})\\u(D[CDEFcdef][0-9a-fA-F]{2})/g;
  for (let m; (m = sur.exec(line));) {
    const high = parseInt(m[1], 16);
    const low = parseInt(m[2], 16);
    const cp = (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
    if (!Number.isFinite(cp) || !isBannedCodePoint(cp)) continue;
    findings.push({
      file,
      line: lineNo,
      col: (m.index ?? 0) + 1,
      kind: 'js_escape',
      codePoint: cp,
      detail: `${m[0]} => ${formatCodePoint(cp)}`,
      snippet: sanitizeLine(line).slice(0, 220),
    });
  }

  return findings;
}

function scanFile(filePath) {
  const findings = [];

  if (shouldSkipFile(filePath)) return findings;

  const absolutePath = path.join(repoRoot, filePath);
  let content;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return findings;
  }

  if (isLikelyBinary(content)) return findings;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    findings.push(...scanLineForUnicodeChars(line, filePath, lineNo));
    findings.push(...scanLineForHtmlEntities(line, filePath, lineNo));
    findings.push(...scanLineForJsUnicodeEscapes(line, filePath, lineNo));
  }

  return findings;
}

function main() {
  const files = getTrackedFiles();
  const findings = files.flatMap(scanFile);

  if (findings.length > 0) {
    console.error('Unicode icon check failed. Use Lucide (Icon.astro) or inline SVG instead of Unicode glyphs.');
    findings.slice(0, 60).forEach((f) => {
      console.error(`- ${f.file}:${f.line}:${f.col} [${f.kind}] ${f.detail}`);
      if (f.snippet) console.error(`  ${f.snippet}`);
    });
    if (findings.length > 60) {
      console.error(`...and ${findings.length - 60} more.`);
    }
    process.exit(1);
  }

  console.log(`Unicode icon check passed: ${files.length} tracked files checked.`);
}

main();

