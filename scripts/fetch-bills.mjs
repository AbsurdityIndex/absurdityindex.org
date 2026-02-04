#!/usr/bin/env node

/**
 * Fetches bills from the Congress.gov API and generates MDX files.
 *
 * Usage:
 *   CONGRESS_GOV_API_KEY=<key> node scripts/fetch-bills.mjs
 *
 * Or set CONGRESS_GOV_API_KEY in .env and run:
 *   node scripts/fetch-bills.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BILLS_DIR = path.resolve(__dirname, '../src/data/bills');
const BASE_URL = 'https://api.congress.gov/v3';
const DELAY_MS = 400; // stay well under 5k req/hour

// Load .env if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  const envText = fs.readFileSync(envPath, 'utf-8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // .env is optional
}

const API_KEY = process.env.CONGRESS_GOV_API_KEY;
if (!API_KEY) {
  console.error('Error: CONGRESS_GOV_API_KEY is required.');
  console.error('Set it in .env or pass as environment variable.');
  process.exit(1);
}

// Bills to fetch — hand-picked for absurdity + variety.
// Format: { congress, type, number, absurdityIndex, category, pairedBillId? }
const BILL_LIST = [
  { congress: 118, type: 'hr', number: 8752, absurdityIndex: 8, category: 'Science' },
  { congress: 118, type: 'hr', number: 6174, absurdityIndex: 7, category: 'Food & Drink' },
  { congress: 118, type: 'hr', number: 3684, absurdityIndex: 6, category: 'Technology' },
  { congress: 119, type: 'hr', number: 25, absurdityIndex: 5, category: 'Budget' },
  { congress: 119, type: 's', number: 1, absurdityIndex: 4, category: 'Common Sense' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${endpoint}${sep}api_key=${API_KEY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${endpoint}`);
  }
  return res.json();
}

function slugify(congress, type, number) {
  return `real-${type}-${number}`;
}

function mdxFilename(slug) {
  return path.join(BILLS_DIR, `${slug}.mdx`);
}

function formatBillNumber(type, number) {
  const prefix = type === 'hr' ? 'H.R.' : type === 's' ? 'S.' : type.toUpperCase() + '.';
  return `${prefix} ${number}`;
}

function escapeMdx(text) {
  if (!text) return '';
  return text.replace(/[{}]/g, (ch) => `\\${ch}`);
}

async function fetchBillData(congress, type, number) {
  // Fetch bill metadata
  const bill = await apiFetch(`/bill/${congress}/${type}/${number}`);
  await sleep(DELAY_MS);

  // Fetch summaries
  let summary = '';
  try {
    const summaries = await apiFetch(`/bill/${congress}/${type}/${number}/summaries`);
    if (summaries.summaries?.length > 0) {
      // Use the latest CRS summary, strip HTML tags
      const raw = summaries.summaries[summaries.summaries.length - 1].text || '';
      summary = raw.replace(/<[^>]+>/g, '').trim();
    }
    await sleep(DELAY_MS);
  } catch {
    // Summaries may not be available
  }

  // Fetch text info
  let excerpt = '';
  try {
    const texts = await apiFetch(`/bill/${congress}/${type}/${number}/text`);
    if (texts.textVersions?.length > 0) {
      // Just note the latest text version; actual text requires PDF parsing
      const latest = texts.textVersions[texts.textVersions.length - 1];
      excerpt = `Text available: ${latest.type || 'Latest version'}`;
    }
    await sleep(DELAY_MS);
  } catch {
    // Text may not be available
  }

  return { bill: bill.bill, summary, excerpt };
}

function generateMdx(billData, meta) {
  const b = billData.bill;
  const title = (b.title || '').replace(/"/g, '\\"');
  const billNumber = formatBillNumber(meta.type, meta.number);
  const sponsor = b.sponsors?.[0]
    ? `${b.sponsors[0].fullName || b.sponsors[0].firstName + ' ' + b.sponsors[0].lastName}`
    : 'Unknown';
  const cosponsors = (b.cosponsors?.count || 0) > 0 ? `${b.cosponsors.count} cosponsors` : '';
  const committee = b.committees?.count > 0 ? 'See Congress.gov' : 'Not yet assigned';
  const status = b.latestAction?.text || 'Introduced';
  const dateIntroduced = b.introducedDate || '2025-01-01';
  const congressUrl = b.url
    ? b.url.replace('api.congress.gov/v3', 'www.congress.gov')
    : `https://www.congress.gov/bill/${meta.congress}th-congress/${meta.type === 'hr' ? 'house-bill' : 'senate-bill'}/${meta.number}`;

  // Trim summary for frontmatter (1-2 sentences)
  let shortSummary = billData.summary;
  if (shortSummary.length > 300) {
    const sentences = shortSummary.split(/(?<=\.)\s+/);
    shortSummary = sentences.slice(0, 2).join(' ');
    if (shortSummary.length > 300) shortSummary = shortSummary.slice(0, 297) + '...';
  }

  const frontmatter = [
    '---',
    `title: "${title}"`,
    `billNumber: "${billNumber}"`,
    `billType: "real"`,
    `category: "${meta.category}"`,
    `tags: []`,
    `sponsor: "${sponsor}"`,
    `cosponsors: [${cosponsors ? `"${cosponsors}"` : ''}]`,
    `committee: "${committee}"`,
    `status: "${status.replace(/"/g, '\\"')}"`,
    `dateIntroduced: ${dateIntroduced}`,
    `summary: "${shortSummary.replace(/"/g, '\\"')}"`,
    `absurdityIndex: ${meta.absurdityIndex}`,
    `congressDotGovUrl: "${congressUrl}"`,
    `congressNumber: ${meta.congress}`,
    `excerpt: "${(billData.excerpt || '').replace(/"/g, '\\"')}"`,
    meta.pairedBillId ? `pairedBillId: "${meta.pairedBillId}"` : null,
    `featured: false`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const body = `
## Congressional Research Service Summary

${escapeMdx(billData.summary) || '*No CRS summary available yet.*'}

## Bill Details

${escapeMdx(billData.excerpt) || '*Full text not yet available in machine-readable format.*'}

> **Source:** This is a real bill introduced in the ${meta.congress}th Congress. [View on Congress.gov](${congressUrl}).
`;

  return frontmatter + '\n' + body;
}

async function main() {
  console.log(`Fetching ${BILL_LIST.length} bills from Congress.gov API...\n`);

  let created = 0;
  let skipped = 0;

  for (const meta of BILL_LIST) {
    const slug = slugify(meta.congress, meta.type, meta.number);
    const filepath = mdxFilename(slug);

    if (fs.existsSync(filepath)) {
      console.log(`  SKIP  ${slug} (already exists)`);
      skipped++;
      continue;
    }

    try {
      console.log(`  FETCH ${slug}...`);
      const data = await fetchBillData(meta.congress, meta.type, meta.number);
      const mdx = generateMdx(data, meta);
      fs.writeFileSync(filepath, mdx, 'utf-8');
      console.log(`  WRITE ${slug}`);
      created++;
    } catch (err) {
      console.error(`  ERROR ${slug}: ${err.message}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main();
