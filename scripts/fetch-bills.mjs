#!/usr/bin/env node

/**
 * Enhanced Congress.gov API fetcher for AbsurdityIndex.org
 * Fetches comprehensive bill data including actions, amendments, committees, etc.
 *
 * Usage:
 *   CONGRESS_GOV_API_KEY=<key> node scripts/fetch-bills.mjs
 *   node scripts/fetch-bills.mjs --bill 112/hr/2112    # fetch specific bill
 *   node scripts/fetch-bills.mjs --update              # update existing files
 *   node scripts/fetch-bills.mjs --no-ai              # skip AI summarization
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dedupeCongressApiActions,
  normalizeActionText,
  toDateOnlyString,
} from '../src/utils/billTransforms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BILLS_DIR = path.resolve(__dirname, '../src/data/bills');
const BASE_URL = 'https://api.congress.gov/v3';
const DELAY_MS = 350; // ~10 req/sec, well under 5k/hour limit

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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const USE_AI = !process.argv.includes('--no-ai') && !!(ANTHROPIC_API_KEY || OPENROUTER_API_KEY);
const UPDATE_MODE = process.argv.includes('--update');

if (!API_KEY) {
  console.error('Error: CONGRESS_GOV_API_KEY is required.');
  console.error('Set it in .env or pass as environment variable.');
  process.exit(1);
}

// Bills to fetch — hand-picked for absurdity + variety
const BILL_LIST = [
  {
    congress: 112,
    type: 'hr',
    number: 2112,
    absurdityIndex: 9,
    category: 'Food & Drink',
    featured: true,
  },
  {
    congress: 109,
    type: 'hr',
    number: 3,
    absurdityIndex: 9,
    category: 'Transportation',
    featured: true,
  },
  { congress: 118, type: 'hr', number: 8752, absurdityIndex: 8, category: 'Science' },
  { congress: 118, type: 'hr', number: 6174, absurdityIndex: 7, category: 'Food & Drink' },
  { congress: 118, type: 'hr', number: 3684, absurdityIndex: 6, category: 'Technology' },
  { congress: 119, type: 'hr', number: 25, absurdityIndex: 5, category: 'Budget' },
  { congress: 119, type: 's', number: 1, absurdityIndex: 4, category: 'Common Sense' },
];

const VALID_BILL_TYPES = new Set([
  'hr',
  's',
  'hres',
  'sres',
  'hjres',
  'sjres',
  'hconres',
  'sconres',
]);

const CONGRESS_GOV_PATH_BY_TYPE = {
  hr: 'house-bill',
  s: 'senate-bill',
  hres: 'house-resolution',
  sres: 'senate-resolution',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
};

const BILL_NUMBER_PREFIX_BY_TYPE = {
  hr: 'H.R.',
  s: 'S.',
  hres: 'H.Res.',
  sres: 'S.Res.',
  hjres: 'H.J.Res.',
  sjres: 'S.J.Res.',
  hconres: 'H.Con.Res.',
  sconres: 'S.Con.Res.',
};

function parseBillSelectorArg(args) {
  const inlineArg = args.find((arg) => arg.startsWith('--bill='));
  if (inlineArg) {
    const value = inlineArg.slice('--bill='.length).trim();
    if (!value) {
      return { error: 'Error: --bill requires a value (example: --bill=119/hr/25).' };
    }
    return { value };
  }

  const billArgIndex = args.indexOf('--bill');
  if (billArgIndex !== -1) {
    const nextValue = args[billArgIndex + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      return { error: 'Error: --bill requires a value (example: --bill 119/hr/25).' };
    }
    return { value: nextValue.trim() };
  }

  return { value: null };
}

// Parse --bill argument (supports both --bill=119/hr/25 and --bill 119/hr/25)
const { value: billSelector, error: billSelectorError } = parseBillSelectorArg(
  process.argv.slice(2),
);
if (billSelectorError) {
  console.error(billSelectorError);
  process.exit(1);
}

if (billSelector) {
  const parts = billSelector.split('/');
  const congress = Number.parseInt(parts[0], 10);
  const type = parts[1]?.toLowerCase();
  const number = Number.parseInt(parts[2], 10);

  if (
    parts.length !== 3 ||
    Number.isNaN(congress) ||
    congress <= 0 ||
    !type ||
    !VALID_BILL_TYPES.has(type) ||
    Number.isNaN(number) ||
    number <= 0
  ) {
    console.error(
      'Error: --bill must be in format <congress>/<type>/<number> (example: 119/hr/25).',
    );
    console.error(`Supported bill types: ${Array.from(VALID_BILL_TYPES).join(', ')}`);
    process.exit(1);
  }

  BILL_LIST.length = 0;
  BILL_LIST.push({
    congress,
    type,
    number,
    absurdityIndex: 5,
    category: 'Uncategorized',
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(endpoint, options = {}) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const limit = options.limit || 250;
  const url = `${BASE_URL}${endpoint}${sep}api_key=${API_KEY}&format=json&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`API ${res.status}: ${endpoint}`);
  }
  return res.json();
}

function slugify(congress, type, number) {
  return `real-${type}-${number}-${congress}`;
}

function formatBillNumber(type, number) {
  const prefix = BILL_NUMBER_PREFIX_BY_TYPE[type] || `${type.toUpperCase()}.`;
  return `${prefix} ${number}`;
}

function congressGovPathSegment(type) {
  return CONGRESS_GOV_PATH_BY_TYPE[type] || null;
}

function stripHtml(html) {
  if (!html) return '';
  return html.replaceAll(/<[^>]+>/g, '').trim();
}

/** Escape double quotes for YAML string embedding. */
function escapeQuotes(str) {
  return (str || '').replaceAll('"', String.raw`\"`);
}

/** Determine chamber from action code prefix. */
function chamberFromActionCode(actionCode) {
  if (actionCode?.startsWith('H')) return 'house';
  if (actionCode?.startsWith('S')) return 'senate';
  return 'both';
}

/** Determine title type label. */
function titleTypeLabel(titleType) {
  if (titleType?.includes('Short')) return 'short';
  if (titleType?.includes('Official')) return 'official';
  return 'display';
}

// normalizeActionText is imported (shared with content config + tests).

// ============================================================================
// FETCH ALL BILL DATA
// ============================================================================

async function fetchBillData(congress, type, number) {
  console.log(`    Fetching bill metadata...`);
  const billRes = await apiFetch(`/bill/${congress}/${type}/${number}`);
  if (!billRes) throw new Error('Bill not found');
  const bill = billRes.bill;
  await sleep(DELAY_MS);

  const data = {
    bill,
    summaries: [],
    actions: [],
    amendments: [],
    committees: [],
    cosponsors: [],
    relatedBills: [],
    subjects: [],
    titles: [],
    textVersions: [],
  };

  // Fetch summaries
  console.log(`    Fetching summaries...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/summaries`);
    data.summaries = res?.summaries || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (summaries not available: ${error_.message})`);
  }

  // Fetch actions (may be paginated for large bills)
  console.log(`    Fetching actions...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/actions`, { limit: 500 });
    data.actions = dedupeCongressApiActions(res?.actions || []);
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (actions not available: ${error_.message})`);
  }

  // Fetch amendments
  console.log(`    Fetching amendments...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/amendments`, { limit: 500 });
    data.amendments = res?.amendments || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (amendments not available: ${error_.message})`);
  }

  // Fetch committees
  console.log(`    Fetching committees...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/committees`);
    data.committees = res?.committees || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (committees not available: ${error_.message})`);
  }

  // Fetch cosponsors
  console.log(`    Fetching cosponsors...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/cosponsors`, { limit: 500 });
    data.cosponsors = res?.cosponsors || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (cosponsors not available: ${error_.message})`);
  }

  // Fetch related bills
  console.log(`    Fetching related bills...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/relatedbills`);
    data.relatedBills = res?.relatedBills || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (related bills not available: ${error_.message})`);
  }

  // Fetch subjects
  console.log(`    Fetching subjects...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/subjects`);
    // Subjects API returns { subjects: { legislativeSubjects: [...], policyArea: {...} } }
    const subjectsData = res?.subjects;
    data.subjects = subjectsData?.legislativeSubjects || [];
    data.policyArea = subjectsData?.policyArea || null;
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (subjects not available: ${error_.message})`);
  }

  // Fetch titles
  console.log(`    Fetching titles...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/titles`);
    data.titles = res?.titles || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (titles not available: ${error_.message})`);
  }

  // Fetch text versions
  console.log(`    Fetching text versions...`);
  try {
    const res = await apiFetch(`/bill/${congress}/${type}/${number}/text`);
    data.textVersions = res?.textVersions || [];
    await sleep(DELAY_MS);
  } catch (error_) {
    console.log(`    (text versions not available: ${error_.message})`);
  }

  return data;
}

// ============================================================================
// AI HELPERS
// ============================================================================

/** Call the configured AI provider and return the response text. */
async function callAiApi(promptText) {
  if (OPENROUTER_API_KEY) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://absurdityindex.org',
        'X-Title': 'AbsurdityIndex Bill Fetcher',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        max_tokens: 1024,
        messages: [{ role: 'user', content: promptText }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter API ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (ANTHROPIC_API_KEY) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: promptText }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  return null;
}

// ============================================================================
// AI SUMMARIZATION
// ============================================================================

async function aiSummarize(
  crsSummary,
  billTitle,
  billNumber,
  actions,
  absurdityIndex,
  committees,
  textVersions,
) {
  if (!crsSummary && actions.length === 0) return null;

  // Build context from actions
  const actionsSummary = actions
    .slice(0, 15)
    .map((a) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  let absurdityContext;
  if (absurdityIndex >= 7) {
    absurdityContext = 'This bill has a HIGH absurdity score. Focus on what makes it ridiculous, wasteful, or head-scratching.';
  } else if (absurdityIndex >= 4) {
    absurdityContext = 'This bill has a MODERATE absurdity score. There may be some questionable provisions or bureaucratic oddities.';
  } else {
    absurdityContext = 'This bill has a LOW absurdity score. It may be fairly straightforward, but find any interesting angles.';
  }

  const promptText = `You are a writer for AbsurdityIndex.org — a satirical editorial site that covers real congressional legislation with wit and accessibility.

BILL: ${billTitle} (${billNumber})
ABSURDITY SCORE: ${absurdityIndex}/10
${absurdityContext}

CRS SUMMARY:
${crsSummary || '(Not available)'}

RECENT ACTIONS:
${actionsSummary || '(None)'}

BILL FACTS:
- Committees referred to: ${(committees || []).length} (${
    (committees || [])
      .map((c) => c.name)
      .filter(Boolean)
      .join(', ') || 'None'
  })
- Bill text available: ${(textVersions || []).length > 0 ? 'Yes' : 'No'} (${(textVersions || []).length} version(s))

Write THREE things:

1. THE_GIST: 2-3 sentences that hook the reader. What's the interesting, surprising, or absurd angle on this bill? Lead with what makes it noteworthy. Write like you're explaining it to a friend at a bar. Be witty but accurate — don't make things up.

2. CARD_SUMMARY: A single punchy sentence (under 150 chars) for preview cards. Capture the essence with editorial flair.

3. WHY_IT_MATTERS: 1-2 sentences on real-world impact. Who does this affect and how? If the bill is just bureaucratic nonsense with no real impact, say so.

TONE: Think John Oliver meets Wikipedia. Informative, accessible, dry wit. Never preachy or partisan. Punch up at absurdity, not at individuals.

RULES:
- Be factually accurate — only reference what's actually in the bill
- Use the BILL FACTS section for exact numbers — do not infer counts from the actions list
- No political hot takes or partisan framing
- If the bill is boring, be honest about that in a funny way
- Don't start with "This bill..." — be more creative

Respond in this exact format:
THE_GIST: [your gist]
CARD_SUMMARY: [your card summary]
WHY_IT_MATTERS: [your impact summary]`;

  try {
    const text = await callAiApi(promptText);
    if (text === null) return null;

    const gistMatch = text.match(/THE_GIST:\s*([\s\S]*?)(?=\nCARD_SUMMARY:)/);
    const cardMatch = text.match(/CARD_SUMMARY:\s*([\s\S]*?)(?=\nWHY_IT_MATTERS:)/);
    const whyMatch = text.match(/WHY_IT_MATTERS:\s*([\s\S]*)/);

    if (!gistMatch || !cardMatch) {
      throw new Error('Could not parse AI response');
    }

    return {
      theGist: gistMatch[1].trim(),
      cardSummary: cardMatch[1].trim(),
      whyItMatters: whyMatch ? whyMatch[1].trim() : '',
    };
  } catch (err) {
    console.warn(`    AI summarization failed: ${err.message}`);
    return null;
  }
}

// ============================================================================
// AI MILESTONE EXTRACTION
// ============================================================================

async function aiExtractMilestones(actions, billNumber, billType) {
  if (!actions || actions.length === 0) return null;
  if (!OPENROUTER_API_KEY && !ANTHROPIC_API_KEY) return null;

  // Format actions for the prompt
  const actionsText = actions
    .slice(0, 50)
    .map((a) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  const billTypeContext = billType.toLowerCase().includes('res')
    ? 'This is a resolution (not a bill), so "passing" may mean adoption/agreement rather than the typical bill process.'
    : 'This is a bill that goes through the standard legislative process.';

  const promptText = `You are analyzing congressional actions for ${billNumber}.
${billTypeContext}

ACTIONS (chronological):
${actionsText}

Extract the 3-5 MOST SIGNIFICANT milestones from these actions. Focus on:
- Introduction (when the bill/resolution was first submitted)
- Committee referral or action (if applicable)
- Floor votes (passed/failed in House or Senate)
- Final disposition (signed, vetoed, adopted, agreed to, became law, etc.)

For each milestone, identify:
1. TYPE: One of: introduced, committee, reported, passed-house, passed-senate, conference, signed, law, vetoed, adopted, agreed, failed
2. DATE: The action date (YYYY-MM-DD format)
3. TEXT: The original action text (do not modify)
4. ICON: One of: file-text (introduced), users (committee), check-square (reported), vote (passed), git-merge (conference), pen-tool (signed), award (law), x-circle (vetoed/failed)

RULES:
- For resolutions, "Agreed to" or "Adopted" typically means passed/final - use type "adopted" or "agreed"
- "On agreeing to the resolution" with yeas/nays IS a floor vote - use type "passed-house" or "passed-senate" based on chamber
- Don't include procedural actions like "Motion to reconsider" unless they're significant
- Maximum 5 milestones, minimum 2 (at least introduction + one other)
- Return milestones in chronological order

Respond in this exact JSON format (no markdown, just JSON):
{
  "milestones": [
    {"type": "introduced", "date": "2025-01-03", "text": "Introduced in House", "icon": "file-text"},
    {"type": "passed-house", "date": "2025-01-03", "text": "On agreeing to the resolution Agreed to by the Yeas and Nays: 215 - 209", "icon": "vote"}
  ]
}`;

  try {
    const text = await callAiApi(promptText);
    if (text === null) return null;

    // Parse JSON response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.milestones || [];
  } catch (err) {
    console.warn(`    AI milestone extraction failed: ${err.message}`);
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse the primary committee from referral action text.
 * Congress.gov always lists the primary committee first:
 *   "Referred to the Committee on X, and in addition to..."
 * Falls back to first committee from API if no referral pattern found.
 */
function parsePrimaryCommittee(statusText, committees) {
  const match = statusText?.match(/Referred to the Committee on ([^,]+?)[,.]/i);
  if (match) {
    const parsed = match[1].trim();
    // Find matching committee from API data, or use parsed name directly
    const found = committees.find((c) => c.name?.toLowerCase().includes(parsed.toLowerCase()));
    return found?.name || `Committee on ${parsed}`;
  }
  return committees[0]?.name || 'Not assigned';
}

// ============================================================================
// GENERATE MDX
// ============================================================================

/** Build individual YAML sections for MDX frontmatter. */
function buildActionsYaml(actions) {
  return actions
    .slice(0, 50)
    .map((a) => {
      const actionText = escapeQuotes(normalizeActionText(a.text));
      return `  - date: ${toDateOnlyString(a.actionDate) || '2000-01-01'}
    text: "${actionText}"
    chamber: ${chamberFromActionCode(a.actionCode)}`;
    })
    .join('\n');
}

function buildTitlesYaml(titles) {
  return titles
    .slice(0, 10)
    .map((t) => {
      const titleText = escapeQuotes(t.title);
      return `  - title: "${titleText}"
    type: ${titleTypeLabel(t.titleType)}`;
    })
    .join('\n');
}

function buildAmendmentsYaml(amendments) {
  return amendments
    .slice(0, 20)
    .map((a) => {
      const desc = escapeQuotes(a.description || a.purpose).slice(0, 200);
      return `  - number: "${a.number || 'Unknown'}"
    description: "${desc}"`;
    })
    .join('\n');
}

function buildCosponsorsYaml(cosponsors) {
  return cosponsors
    .slice(0, 30)
    .map((c) => {
      const name = escapeQuotes(c.fullName || `${c.firstName} ${c.lastName}`);
      return `  - name: "${name}"
    party: "${c.party || ''}"
    state: "${c.state || ''}"`;
    })
    .join('\n');
}

function buildCommitteesYaml(committees) {
  return committees
    .map((c) => {
      const name = escapeQuotes(c.name);
      return `  - name: "${name}"
    chamber: ${c.chamber?.toLowerCase() || 'house'}`;
    })
    .join('\n');
}

function buildRelatedBillsYaml(relatedBills) {
  return relatedBills
    .slice(0, 10)
    .map((r) => {
      const num = (r.number || '').toString();
      const relTitle = escapeQuotes(r.title).slice(0, 100);
      return `  - billNumber: "${r.type?.toUpperCase() || ''} ${num}"
    title: "${relTitle}"
    relationship: "${r.relationshipDetails?.[0]?.type || 'Related'}"`;
    })
    .join('\n');
}

function buildMilestonesYaml(milestones) {
  if (!milestones || milestones.length === 0) return '';
  return milestones
    .map((m) => {
      const milestoneText = escapeQuotes(m.text).replaceAll('\n', ' ');
      return `  - type: "${m.type}"
    date: ${m.date}
    text: "${milestoneText}"
    icon: "${m.icon}"`;
    })
    .join('\n');
}

/** Conditionally include a YAML frontmatter line. */
function optionalLine(content) {
  return content || '';
}

/** Extract sponsor info from bill data. */
function extractSponsor(bill) {
  const sponsorObj = bill.sponsors?.[0];
  if (!sponsorObj) return { name: 'Unknown', party: '', state: '' };
  const name = sponsorObj.fullName || sponsorObj.firstName + ' ' + sponsorObj.lastName;
  return { name, party: sponsorObj.party || '', state: sponsorObj.state || '' };
}

/** Build the Congress.gov URL for a bill. */
function buildCongressUrl(meta) {
  const congressTypePath = congressGovPathSegment(meta.type);
  if (!congressTypePath) {
    throw new Error(`Unsupported bill type for Congress.gov URL mapping: ${meta.type}`);
  }
  return `https://www.congress.gov/bill/${meta.congress}th-congress/${congressTypePath}/${meta.number}`;
}

/** Escape and flatten a string for inline YAML. */
function yamlInline(str) {
  if (!str) return '';
  return escapeQuotes(str).replaceAll('\n', ' ');
}

function buildTextVersionsYaml(textVersions) {
  return textVersions
    .map((t) => {
      const date = toDateOnlyString(t.date) || '2000-01-01';
      return `  - type: "${t.type || 'Unknown'}"
    date: ${date}`;
    })
    .join('\n');
}

function buildTagsString(subjects) {
  return subjects
    .slice(0, 10)
    .map((s) => `"${escapeQuotes(s.name)}"`)
    .join(', ');
}

/** Get the latest CRS summary text, stripped of HTML. */
function getLatestCrsSummary(summaries) {
  if (summaries.length === 0) return '';
  return stripHtml(summaries.at(-1).text);
}

/** Truncate summary to 200 chars for card display. */
function truncateSummary(text, maxLen = 200) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/** Resolve the policy area name from available data sources. */
function resolvePolicyArea(data, bill, meta) {
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  return data.policyArea?.name || bill.policyArea?.name || subjects[0]?.name || meta.category;
}

/** Get subjects array safely. */
function getSubjects(data) {
  return Array.isArray(data.subjects) ? data.subjects : [];
}

function generateMdx(data, meta, aiSummary, aiMilestones) {
  const b = data.bill;
  const title = escapeQuotes(b.title);
  const billNumber = formatBillNumber(meta.type, meta.number);
  const sponsor = extractSponsor(b);
  const congressUrl = buildCongressUrl(meta);

  const latestAction = b.latestAction;
  const status = latestAction?.text || 'Introduced';
  const dateIntroduced = toDateOnlyString(b.introducedDate) || '2025-01-01';
  const dateUpdated = latestAction?.actionDate ? toDateOnlyString(latestAction.actionDate) : null;
  const crsSummary = getLatestCrsSummary(data.summaries);
  const shortSummary = truncateSummary(aiSummary?.cardSummary || crsSummary);
  const theGist = aiSummary?.theGist || '';
  const whyItMatters = aiSummary?.whyItMatters || '';
  const uniqueActions = Array.isArray(data.actions) ? data.actions : [];

  // Build YAML sections
  const actionsYaml = buildActionsYaml(uniqueActions);
  const titlesYaml = buildTitlesYaml(data.titles);
  const amendmentsYaml = buildAmendmentsYaml(data.amendments);
  const cosponsorsYaml = buildCosponsorsYaml(data.cosponsors);
  const committeesYaml = buildCommitteesYaml(data.committees);
  const relatedBillsYaml = buildRelatedBillsYaml(data.relatedBills);
  const keyMilestonesYaml = buildMilestonesYaml(aiMilestones);
  const textVersionsYaml = buildTextVersionsYaml(data.textVersions);

  const subjects = getSubjects(data);
  const policyArea = resolvePolicyArea(data, b, meta);
  const tags = buildTagsString(subjects);

  // Build frontmatter
  const frontmatter = `---
title: "${title}"
billNumber: "${billNumber}"
billType: "real"
category: "${policyArea}"
tags: [${tags}]

sponsor: "${sponsor.name}"
sponsorParty: "${sponsor.party}"
sponsorState: "${sponsor.state}"
cosponsorCount: ${data.cosponsors.length}
${cosponsorsYaml ? `cosponsors:\n${cosponsorsYaml}` : 'cosponsors: []'}

committee: "${parsePrimaryCommittee(status, data.committees)}"
${optionalLine(committeesYaml && `committees:\n${committeesYaml}`)}

status: "${escapeQuotes(status)}"
dateIntroduced: ${dateIntroduced}
${optionalLine(dateUpdated && `dateUpdated: ${dateUpdated}`)}

actionCount: ${uniqueActions.length}
${optionalLine(actionsYaml && `actions:\n${actionsYaml}`)}

${optionalLine(keyMilestonesYaml && `keyMilestones:\n${keyMilestonesYaml}`)}

officialTitle: "${title}"
${optionalLine(titlesYaml && `shortTitles:\n${titlesYaml}`)}

summary: "${yamlInline(shortSummary)}"
${optionalLine(theGist && `theGist: "${yamlInline(theGist)}"`)}
${optionalLine(whyItMatters && `whyItMatters: "${yamlInline(whyItMatters)}"`)}
${optionalLine(crsSummary && `crsSummary: "${yamlInline(crsSummary).slice(0, 2000)}"`)}

amendmentCount: ${data.amendments.length}
${optionalLine(amendmentsYaml && `amendments:\n${amendmentsYaml}`)}

${optionalLine(relatedBillsYaml && `relatedBills:\n${relatedBillsYaml}`)}

${optionalLine(textVersionsYaml && `textVersions:\n${textVersionsYaml}`)}

absurdityIndex: ${meta.absurdityIndex}
congressDotGovUrl: "${congressUrl}"
congressNumber: ${meta.congress}
featured: ${meta.featured || false}
---`;

  const body = `
> **Source:** Real bill from the ${meta.congress}th Congress. Data from [Congress.gov](${congressUrl}).
`;

  return frontmatter + '\n' + body;
}

// ============================================================================
// MAIN
// ============================================================================

/** Process a single bill entry: fetch, summarize, generate, write. Returns 'created' | 'updated'. */
async function processBill(meta, filepath) {
  const data = await fetchBillData(meta.congress, meta.type, meta.number);

  console.log(
    `    Stats: Actions: ${data.actions.length}, Amendments: ${data.amendments.length}, Cosponsors: ${data.cosponsors.length}`,
  );

  let aiResult = null;
  let aiMilestones = null;
  if (USE_AI) {
    const crsSummary =
      data.summaries.length > 0
        ? stripHtml(data.summaries.at(-1).text)
        : '';
    console.log(`    AI summarizing...`);
    aiResult = await aiSummarize(
      crsSummary,
      data.bill.title,
      formatBillNumber(meta.type, meta.number),
      data.actions,
      meta.absurdityIndex,
      data.committees,
      data.textVersions,
    );

    console.log(`    AI extracting milestones...`);
    aiMilestones = await aiExtractMilestones(
      data.actions,
      formatBillNumber(meta.type, meta.number),
      meta.type,
    );
    if (aiMilestones) {
      console.log(`    Extracted ${aiMilestones.length} milestones`);
    }
  }

  const mdx = generateMdx(data, meta, aiResult, aiMilestones);
  fs.writeFileSync(filepath, mdx, 'utf-8');
}

console.log(`\nAbsurdityIndex Bill Fetcher`);
console.log(`   Fetching ${BILL_LIST.length} bill(s) from Congress.gov API\n`);

if (USE_AI) {
  const provider = OPENROUTER_API_KEY ? 'OpenRouter' : 'Anthropic';
  console.log(`   AI summarization: ENABLED (${provider})`);
} else {
  console.log('   AI summarization: DISABLED');
}
if (UPDATE_MODE) console.log('   Update mode: ENABLED (will overwrite existing files)');
console.log();

let created = 0;
let updated = 0;
let skipped = 0;
let errors = 0;

for (const meta of BILL_LIST) {
  const slug = slugify(meta.congress, meta.type, meta.number);
  const filepath = path.join(BILLS_DIR, `${slug}.mdx`);

  const exists = fs.existsSync(filepath);
  if (exists && !UPDATE_MODE) {
    console.log(`SKIP  ${slug} (exists, use --update to overwrite)`);
    skipped++;
    continue;
  }

  try {
    console.log(`FETCH ${slug}`);
    await processBill(meta, filepath);

    if (exists) {
      console.log(`UPDATE ${slug}`);
      updated++;
    } else {
      console.log(`CREATE ${slug}`);
      created++;
    }
  } catch (err) {
    console.error(`ERROR ${slug}: ${err.message}`);
    errors++;
  }

  console.log();
}

console.log(
  `\nSummary: Created ${created}, Updated ${updated}, Skipped ${skipped}, Errors ${errors}`,
);
