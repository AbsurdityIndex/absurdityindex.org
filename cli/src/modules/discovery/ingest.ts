import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type Database from 'better-sqlite3';
import chalk from 'chalk';
import { getLogger } from '../../utils/logger.js';
import { CongressApi, type FullBillData } from './congress-api.js';
import { createDiscoveredBillModel, type BillArchetype, type DiscoveredBill } from '../state/models/discovered-bills.js';
import { createGenerationModel } from '../state/models/generations.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const CONGRESS_GOV_PATH_BY_TYPE: Record<string, string> = {
  hr: 'house-bill',
  s: 'senate-bill',
  hres: 'house-resolution',
  sres: 'senate-resolution',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
};

function formatBillNumber(type: string, number: number): string {
  const prefix = type === 'hr' ? 'H.R.' : type === 's' ? 'S.' : type.toUpperCase() + '.';
  return `${prefix} ${number}`;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').trim();
}

function escYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// ─── Archetype Detection ──────────────────────────────────────────────────

/**
 * Classify a bill into an archetype based on title, bill type, CRS summary,
 * and policy area. Detection order: omnibus → appropriations → naming →
 * commemorative → general (first match wins).
 */
function detectArchetype(
  title: string,
  billType: string,
  crsSummary: string,
  policyArea: string | null,
): BillArchetype {
  const t = title.toLowerCase();
  const summary = crsSummary.toLowerCase();

  // Omnibus: consolidated/omnibus appropriations with multiple divisions
  if (
    /consolidated\s+appropriations|omnibus|minibus/.test(t) ||
    (/appropriations/.test(t) && /division|title/i.test(summary) && /\$\d|billion|trillion/.test(summary))
  ) {
    return 'omnibus';
  }

  // Appropriations: single-department spending bills
  if (/appropriations\s+act/.test(t)) {
    return 'appropriations';
  }

  // Naming: post office / building designations
  if (/designat.*post|nam.*building|nam.*post\s*office|nam.*facility|designat.*facility/.test(t)) {
    return 'naming';
  }
  if (
    policyArea?.toLowerCase() === 'government operations and politics' &&
    /designat|renam|nam.*for|nam.*in\s+honor/.test(t)
  ) {
    return 'naming';
  }

  // Commemorative: resolutions declaring national days/weeks/months
  if (/national\s+.*\s+(day|week|month)|recognizing|honoring|celebrating|expressing\s+support/.test(t)) {
    return 'commemorative';
  }
  if (['hres', 'sres', 'hconres', 'sconres'].includes(billType) && /honor|recogni|celebrat|commend|acknowledg/.test(t)) {
    return 'commemorative';
  }

  return 'general';
}

export interface IngestResult {
  slug: string;
  filePath: string;
  title: string;
  absurdityIndex: number;
}

// ─── Vote Parsing ──────────────────────────────────────────────────────────

interface ParsedVote {
  yeas: number;
  nays: number;
  notVoting?: number;
  passed: boolean;
  chamber: 'house' | 'senate';
  rollCallNumber?: number;
  rollCallUrl?: string;
  actionDate: string;
}

/**
 * Parse vote tallies from action text.
 * Congress.gov embeds votes like "Passed by the Yeas and Nays: 350 - 70"
 */
function parseVotesFromActions(actions: any[]): ParsedVote[] {
  const votes: ParsedVote[] = [];

  for (const action of actions) {
    const text: string = action.text || '';
    const actionDate: string = action.actionDate || '';
    const actionCode: string = action.actionCode || '';

    // Match "Yeas and Nays: X - Y" or "Yea-Nay Vote. X - Y"
    const voteMatch = text.match(/(?:Yeas? and Nays?|Yea-Nay Vote)[.:]?\s*(\d+)\s*-\s*(\d+)/i);
    if (!voteMatch) continue;

    const yeas = parseInt(voteMatch[1]!, 10);
    const nays = parseInt(voteMatch[2]!, 10);

    // Determine chamber
    const isHouse = actionCode.startsWith('H') ||
      /\b(House|Speaker)\b/i.test(text) ||
      /Roll no\./i.test(text);
    const isSenate = actionCode.startsWith('S') ||
      /\bSenate\b/i.test(text) ||
      /Record Vote Number/i.test(text);
    const chamber: 'house' | 'senate' = isSenate && !isHouse ? 'senate' : 'house';

    // Determine if passed
    const passed = /\b(Passed|Agreed|Adopted|Approved)\b/i.test(text);

    // Extract not voting count if present
    const nvMatch = text.match(/(\d+)\s*(?:Not Voting|Present)/i);
    const notVoting = nvMatch ? parseInt(nvMatch[1]!, 10) : undefined;

    // Extract roll call number
    let rollCallNumber: number | undefined;
    let rollCallUrl: string | undefined;

    // House: "Roll no. 523" or "(Roll Call no. 523)"
    const houseRollMatch = text.match(/Roll (?:no|Call no)[. ]*(\d+)/i);
    if (houseRollMatch) {
      rollCallNumber = parseInt(houseRollMatch[1]!, 10);
      const year = actionDate.split('-')[0];
      if (year) {
        rollCallUrl = `https://clerk.house.gov/evs/${year}/roll${String(rollCallNumber).padStart(3, '0')}.xml`;
      }
    }

    // Senate: "Record Vote Number: 456"
    const senateRollMatch = text.match(/Record Vote Number[: ]*(\d+)/i);
    if (senateRollMatch) {
      rollCallNumber = parseInt(senateRollMatch[1]!, 10);
      const year = actionDate.split('-')[0];
      if (year) {
        rollCallUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${year.slice(-2)}${rollCallNumber}/vote_${year.slice(-2)}_${String(rollCallNumber).padStart(5, '0')}.htm`;
      }
    }

    votes.push({ yeas, nays, notVoting, passed, chamber, rollCallNumber, rollCallUrl, actionDate });
  }

  return votes;
}

/**
 * Get the final passage vote (most significant for display).
 * Prefers the last "passed" vote; falls back to last vote overall.
 */
function getFinalVote(votes: ParsedVote[]): ParsedVote | null {
  if (votes.length === 0) return null;
  const passedVotes = votes.filter(v => v.passed);
  return passedVotes.length > 0 ? passedVotes[passedVotes.length - 1]! : votes[votes.length - 1]!;
}

// ─── Cosponsor Enrichment ──────────────────────────────────────────────────

interface EnrichedCosponsor {
  name: string;
  party: string;
  state: string;
  chamber: 'house' | 'senate';
  bioguideId?: string;
  congressUrl?: string;
}

function enrichCosponsors(cosponsors: any[], billType: string): EnrichedCosponsor[] {
  return cosponsors.slice(0, 30).map((c: any) => {
    const name = c.fullName || `${c.firstName} ${c.lastName}`;
    const bioguideId = c.bioguideId || '';
    // The cosponsor API often has a URL field
    const congressUrl = bioguideId
      ? `https://www.congress.gov/member/${name.toLowerCase().replace(/[^a-z]/g, '-').replace(/-+/g, '-')}/${bioguideId}`
      : '';
    // Determine chamber: check if title/district is present, or infer from bill type
    const isHouseMember = c.district != null || /^Rep\b/i.test(name);
    const chamber: 'house' | 'senate' = isHouseMember ? 'house' : 'senate';

    return {
      name,
      party: c.party || '',
      state: c.state || '',
      chamber,
      bioguideId: bioguideId || undefined,
      congressUrl: congressUrl || undefined,
    };
  });
}

// ─── Main Ingest Function ──────────────────────────────────────────────────

/**
 * Ingest a discovered bill: fetch full data, AI summarize, generate MDX.
 */
export async function ingestBill(
  db: Database.Database,
  api: CongressApi,
  anthropicApiKey: string,
  billsDir: string,
  bill: DiscoveredBill,
  dryRun: boolean,
): Promise<IngestResult> {
  const log = getLogger();
  const model = createDiscoveredBillModel(db);
  const generations = createGenerationModel(db);
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const slug = `real-${bill.bill_type}-${bill.bill_number}-${bill.congress}`;
  const filePath = path.join(billsDir, `${slug}.mdx`);

  console.log(chalk.bold(`\n  Ingesting: ${bill.title.slice(0, 70)}`));
  console.log(chalk.dim(`  ${slug}`));

  // ─── Fetch full bill data ─────────────────────────────────────────────
  console.log(chalk.dim('  Fetching full bill data...'));
  const data = await api.fetchFull(bill.congress, bill.bill_type, bill.bill_number);

  console.log(chalk.dim(`  Actions: ${data.actions.length}, Amendments: ${data.amendments.length}, Cosponsors: ${data.cosponsors.length}`));

  // ─── Parse votes from actions ─────────────────────────────────────────
  console.log(chalk.dim('  Parsing votes from actions...'));
  const parsedVotes = parseVotesFromActions(data.actions);
  const finalVote = getFinalVote(parsedVotes);
  if (finalVote) {
    console.log(chalk.dim(`  Vote found: ${finalVote.yeas}-${finalVote.nays} (${finalVote.chamber})`));
  }

  // ─── Enrich cosponsors ────────────────────────────────────────────────
  const enrichedCosponsors = enrichCosponsors(data.cosponsors, bill.bill_type);

  // ─── AI Summarize ─────────────────────────────────────────────────────
  const crsSummary = data.summaries.length > 0
    ? stripHtml(data.summaries[data.summaries.length - 1].text)
    : '';

  const absurdityIndex = bill.ai_score ?? 5;

  // ─── Detect Archetype ──────────────────────────────────────────────
  const archetype = detectArchetype(bill.title, bill.bill_type, crsSummary, bill.policy_area);
  console.log(chalk.dim(`  Archetype: ${archetype}`));

  if (!dryRun) {
    model.setArchetype(bill.id, archetype);
  }

  // ─── AI Extract Omnibus Data (omnibus only) ─────────────────────────
  let omnibusData: OmnibusData | null = null;
  if (archetype === 'omnibus') {
    console.log(chalk.dim('  AI extracting omnibus data...'));
    try {
      omnibusData = await runAiExtractOmnibusData(
        client, crsSummary, bill.title, data.actions, data.textVersions,
      );
      if (omnibusData && !dryRun) {
        generations.record({
          purpose: 'discovery-ingest-omnibus',
          model: HAIKU_MODEL,
          inputTokens: 1500,
          outputTokens: 800,
          billSlug: slug,
        });
      }
      if (omnibusData) {
        console.log(chalk.dim(`  Omnibus: ${omnibusData.divisions.length} divisions, ${omnibusData.riders?.length ?? 0} riders`));
      }
    } catch (err: any) {
      log.warn({ err: err.message }, 'AI omnibus data extraction failed');
    }
  }

  let aiSummary: { theGist: string; cardSummary: string; whyItMatters: string } | null = null;

  console.log(chalk.dim('  AI summarizing...'));
  try {
    aiSummary = await runAiSummarize(
      client, crsSummary, bill.title,
      formatBillNumber(bill.bill_type, bill.bill_number),
      data.actions, absurdityIndex, archetype,
    );
    if (aiSummary && !dryRun) {
      generations.record({
        purpose: 'discovery-ingest-summary',
        model: HAIKU_MODEL,
        inputTokens: 800,
        outputTokens: 300,
        billSlug: slug,
      });
    }
  } catch (err: any) {
    log.warn({ err: err.message }, 'AI summarization failed');
  }

  // ─── AI Extract Milestones ────────────────────────────────────────────
  let aiMilestones: Array<{ type: string; date: string; text: string; icon: string }> | null = null;

  console.log(chalk.dim('  AI extracting milestones...'));
  try {
    aiMilestones = await runAiExtractMilestones(
      client, data.actions,
      formatBillNumber(bill.bill_type, bill.bill_number),
      bill.bill_type,
    );
    if (aiMilestones && !dryRun) {
      generations.record({
        purpose: 'discovery-ingest-milestones',
        model: HAIKU_MODEL,
        inputTokens: 600,
        outputTokens: 300,
        billSlug: slug,
      });
    }
  } catch (err: any) {
    log.warn({ err: err.message }, 'AI milestone extraction failed');
  }

  // ─── AI Bill Evolution ────────────────────────────────────────────────
  let aiEvolution: BillEvolutionStage[] | null = null;

  console.log(chalk.dim('  AI generating bill evolution...'));
  try {
    aiEvolution = await runAiBillEvolution(
      client, data, bill, crsSummary, absurdityIndex, parsedVotes,
    );
    if (aiEvolution && !dryRun) {
      generations.record({
        purpose: 'discovery-ingest-evolution',
        model: HAIKU_MODEL,
        inputTokens: 1200,
        outputTokens: 800,
        billSlug: slug,
      });
    }
    if (aiEvolution) {
      console.log(chalk.dim(`  Evolution: ${aiEvolution.length} stages`));
    }
  } catch (err: any) {
    log.warn({ err: err.message }, 'AI bill evolution generation failed');
  }

  // ─── AI Editorial Body Content ────────────────────────────────────────
  let bodyContent = '';

  // For naming archetype, get the session count for context
  let namingSessionCount: number | undefined;
  if (archetype === 'naming' || archetype === 'commemorative') {
    namingSessionCount = model.countByArchetypeInCongress(bill.congress, 'naming')
      + model.countByArchetypeInCongress(bill.congress, 'commemorative');
  }

  console.log(chalk.dim('  AI generating editorial body...'));
  try {
    bodyContent = await runAiEditorialBody(
      client, bill, crsSummary, data, absurdityIndex, archetype, namingSessionCount,
    );
    if (bodyContent && !dryRun) {
      generations.record({
        purpose: 'discovery-ingest-body',
        model: HAIKU_MODEL,
        inputTokens: 900,
        outputTokens: 500,
        billSlug: slug,
      });
    }
  } catch (err: any) {
    log.warn({ err: err.message }, 'AI editorial body generation failed');
  }

  // ─── Calculate totalPork from evolution ────────────────────────────────
  const totalPork = aiEvolution
    ? aiEvolution[aiEvolution.length - 1]?.cumulativePork ?? 0
    : 0;

  // ─── Generate MDX ─────────────────────────────────────────────────────
  const meta = {
    congress: bill.congress,
    type: bill.bill_type,
    number: bill.bill_number,
    absurdityIndex,
    category: bill.policy_area || 'Uncategorized',
    featured: false,
  };

  const congressTypePath = CONGRESS_GOV_PATH_BY_TYPE[meta.type];
  const congressUrl = congressTypePath
    ? `https://www.congress.gov/bill/${meta.congress}th-congress/${congressTypePath}/${meta.number}`
    : '';

  const mdx = generateMdx(data, meta, aiSummary, aiMilestones, {
    finalVote,
    allVotes: parsedVotes,
    enrichedCosponsors,
    aiEvolution,
    totalPork,
    bodyContent,
    congressUrl,
    archetype,
    omnibusData,
  });

  if (dryRun) {
    console.log(chalk.yellow('\n  [DRY RUN — MDX preview]'));
    console.log(chalk.dim(mdx.slice(0, 800) + '\n  ...'));
  } else {
    fs.writeFileSync(filePath, mdx, 'utf-8');
    model.markIngested(bill.id, slug);
    console.log(chalk.green(`  Written: ${filePath}`));
  }

  return { slug, filePath, title: bill.title, absurdityIndex };
}

// ─── Omnibus Data Types ─────────────────────────────────────────────────────

interface OmnibusData {
  totalSpending: number;
  pageCount: number;
  divisions: Array<{
    title: string;
    shortTitle?: string;
    spending: number;
    description?: string;
  }>;
  riders?: Array<{
    title: string;
    description: string;
    category?: 'policy' | 'spending' | 'tax' | 'controversial' | 'sneaky';
  }>;
  timeline?: Array<{
    date: string;
    event: string;
  }>;
}

// ─── AI Omnibus Data Extraction ─────────────────────────────────────────────

async function runAiExtractOmnibusData(
  client: Anthropic,
  crsSummary: string,
  billTitle: string,
  actions: any[],
  textVersions: any[],
): Promise<OmnibusData | null> {
  const actionsText = actions.slice(0, 30)
    .map((a: any) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  const textVersionCount = textVersions.length;

  const prompt = `You are analyzing an omnibus/consolidated appropriations bill for AbsurdityIndex.org.

BILL: ${billTitle}

CRS SUMMARY:
${crsSummary || '(Not available)'}

ACTIONS:
${actionsText || '(None)'}

TEXT VERSIONS: ${textVersionCount} version(s) available

Extract structured data about this omnibus bill. Be accurate — only include information you can justify from the CRS summary and actions.

For each DIVISION:
- Extract the real division name from the CRS text
- Provide a short title (e.g., "Defense", "Labor-HHS-Education")
- Estimate spending in billions from the text (use 0 if unknown)
- Write a satirical 1-sentence description matching this style: "Funds USDA, FDA, rural development programs, and food assistance. Includes farm subsidies that definitely aren't socialism."

For RIDERS — non-spending policy provisions bundled into the bill:
- Identify provisions that aren't standard appropriations
- Categorize as: policy, spending, tax, controversial, or sneaky
- Write a dry, witty description

For TIMELINE — key process dates:
- When was text released
- Key procedural and floor votes
- Signing date

Respond in this exact JSON format (no markdown, just JSON):
{
  "totalSpending": 1700,
  "pageCount": 0,
  "divisions": [
    {"title": "Full Division Title", "shortTitle": "Short Name", "spending": 25.5, "description": "Satirical description."}
  ],
  "riders": [
    {"title": "Rider Name", "description": "What it does and why it's in a spending bill.", "category": "policy"}
  ],
  "timeline": [
    {"date": "2024-01-15", "event": "What happened"}
  ]
}

RULES:
- totalSpending is in billions (e.g., 1700 = $1.7 trillion)
- pageCount: estimate from text or set to 0 if unknown
- Only include divisions you can identify from the CRS text
- If spending amounts aren't clear, use 0 rather than guessing
- Riders should be genuinely notable provisions, not standard appropriations language
- Timeline should be 3-8 key events`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.divisions || !Array.isArray(parsed.divisions)) return null;

  return {
    totalSpending: parsed.totalSpending ?? 0,
    pageCount: parsed.pageCount ?? 0,
    divisions: parsed.divisions,
    riders: parsed.riders,
    timeline: parsed.timeline,
  };
}

// ─── Archetype Prompt Helpers ────────────────────────────────────────────────

function getArchetypeSummarizeContext(archetype: BillArchetype): string {
  switch (archetype) {
    case 'omnibus':
      return 'This is an omnibus/consolidated appropriations bill. Focus on: total spending, how many bills are bundled, what\'s hidden in the fine print, and the process absurdity (pages released at odd hours, time given to read, etc.).';
    case 'appropriations':
      return 'This is an appropriations bill for a single department. Focus on: what the money buys, any notable spending items, and whether the amount represents an increase or decrease.';
    case 'naming':
      return 'This is a post office/building naming bill. The absurdity isn\'t the bill itself — it\'s Congress spending time on this. Frame the gist around priorities: what ELSE Congress could be legislating right now.';
    case 'commemorative':
      return 'This is a commemorative resolution (national day/week/month). The humor is in the meta-absurdity: while major issues go unaddressed, Congress is declaring a national awareness day. Play up the contrast.';
    default:
      return '';
  }
}

function getArchetypeEditorialSections(archetype: BillArchetype, namingSessionCount?: number): string {
  switch (archetype) {
    case 'omnibus':
      return `Write exactly these 3 sections:

## The Spending Breakdown
What each division funds, in plain English. Hit the highlights — biggest allocations, surprising items.

## The Riders
Policy provisions hiding in the spending bill. What got slipped in that has nothing to do with funding?

## The Process
How fast they had to vote, when the text dropped, and the procedural absurdity of passing thousands of pages sight-unseen.`;

    case 'appropriations':
      return `Write exactly these 3 sections:

## What's Actually In It
Key provisions and spending items, in plain English. What are taxpayers buying?

## The Numbers
Spending context — increase or decrease from last year, cost per taxpayer, how it compares to other priorities.

## The Fine Print
Notable provisions most people miss. Any policy changes buried in the spending language?`;

    case 'naming':
      return `Write exactly these 3 sections:

## The Honoree
Who or what is being named and why. Give the honoree their due — briefly.

## Meanwhile, In Congress...
What substantive legislation is stalled while this moves forward? What bills are stuck in committee while naming bills sail through?${namingSessionCount ? `\n\nCONTEXT: Congress has introduced approximately ${namingSessionCount} naming/commemorative bills this session.` : ''}

## The Tally
How common are naming bills? Put this in perspective — Congress passes more naming bills than substantive legislation most sessions.`;

    case 'commemorative':
      return `Write exactly these 3 sections:

## The Occasion
What's being recognized and the stated rationale. Be respectful of the cause, but dry about the vehicle.

## The Awareness Inventory
What other things has Congress officially "recognized" recently? The humor is in the volume and variety.${namingSessionCount ? `\n\nCONTEXT: Congress has introduced approximately ${namingSessionCount} naming/commemorative bills this session.` : ''}

## The Actual Impact
Spoiler: none — these resolutions are non-binding. But here's what Congress could have done instead with that floor time.`;

    default:
      return '';
  }
}

// ─── AI Summarization ──────────────────────────────────────────────────────

async function runAiSummarize(
  client: Anthropic,
  crsSummary: string,
  billTitle: string,
  billNumber: string,
  actions: any[],
  absurdityIndex: number,
  archetype: BillArchetype = 'general',
): Promise<{ theGist: string; cardSummary: string; whyItMatters: string } | null> {
  if (!crsSummary && actions.length === 0) return null;

  const actionsSummary = actions.slice(0, 15)
    .map((a: any) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  const absurdityContext = absurdityIndex >= 7
    ? 'This bill has a HIGH absurdity score. Focus on what makes it ridiculous, wasteful, or head-scratching.'
    : absurdityIndex >= 4
    ? 'This bill has a MODERATE absurdity score. There may be some questionable provisions or bureaucratic oddities.'
    : 'This bill has a LOW absurdity score. It may be fairly straightforward, but find any interesting angles.';

  const archetypeContext = getArchetypeSummarizeContext(archetype);

  const prompt = `You are a writer for AbsurdityIndex.org — a satirical editorial site that covers real congressional legislation with wit and accessibility.

BILL: ${billTitle} (${billNumber})
ABSURDITY SCORE: ${absurdityIndex}/10
${absurdityContext}
${archetypeContext ? `\nARCHETYPE GUIDANCE:\n${archetypeContext}\n` : ''}
CRS SUMMARY:
${crsSummary || '(Not available)'}

RECENT ACTIONS:
${actionsSummary || '(None)'}

Write THREE things:

1. THE_GIST: 2-3 sentences that hook the reader. What's the interesting, surprising, or absurd angle on this bill? Lead with what makes it noteworthy. Write like you're explaining it to a friend at a bar. Be witty but accurate — don't make things up.

2. CARD_SUMMARY: A single punchy sentence (under 150 chars) for preview cards. Capture the essence with editorial flair.

3. WHY_IT_MATTERS: 1-2 sentences on real-world impact. Who does this affect and how? If the bill is just bureaucratic nonsense with no real impact, say so.

TONE: Think John Oliver meets Wikipedia. Informative, accessible, dry wit. Never preachy or partisan. Punch up at absurdity, not at individuals.

RULES:
- Be factually accurate — only reference what's actually in the bill
- No political hot takes or partisan framing
- If the bill is boring, be honest about that in a funny way
- Don't start with "This bill..." — be more creative

Respond in this exact format:
THE_GIST: [your gist]
CARD_SUMMARY: [your card summary]
WHY_IT_MATTERS: [your impact summary]`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';

  const gistMatch = text.match(/THE_GIST:\s*([\s\S]*?)(?=\nCARD_SUMMARY:)/);
  const cardMatch = text.match(/CARD_SUMMARY:\s*([\s\S]*?)(?=\nWHY_IT_MATTERS:)/);
  const whyMatch = text.match(/WHY_IT_MATTERS:\s*([\s\S]*)/);

  if (!gistMatch || !cardMatch) return null;

  return {
    theGist: gistMatch[1]!.trim(),
    cardSummary: cardMatch[1]!.trim(),
    whyItMatters: whyMatch?.[1]?.trim() ?? '',
  };
}

// ─── AI Milestone Extraction ───────────────────────────────────────────────

async function runAiExtractMilestones(
  client: Anthropic,
  actions: any[],
  billNumber: string,
  billType: string,
): Promise<Array<{ type: string; date: string; text: string; icon: string }> | null> {
  if (!actions || actions.length === 0) return null;

  const actionsText = actions.slice(0, 50)
    .map((a: any) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  const billTypeContext = billType.toLowerCase().includes('res')
    ? 'This is a resolution (not a bill), so "passing" may mean adoption/agreement rather than the typical bill process.'
    : 'This is a bill that goes through the standard legislative process.';

  const prompt = `You are analyzing congressional actions for ${billNumber}.
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

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.milestones || [];
}

// ─── AI Bill Evolution ─────────────────────────────────────────────────────

interface BillEvolutionStage {
  stage: string;
  chamber?: string;
  date: string;
  paraphrasedText: string;
  cumulativePork: number;
  porkAddedThisStage: number;
  keyChanges: string[];
  vote?: {
    yeas: number;
    nays: number;
    notVoting?: number;
    passed: boolean;
    chamber: string;
    rollCallNumber?: number;
    rollCallUrl?: string;
  };
  porkItems?: Array<{
    description: string;
    amount: number;
    addedBy: string;
    category: string;
    satiricalNote?: string;
  }>;
}

async function runAiBillEvolution(
  client: Anthropic,
  data: FullBillData,
  bill: DiscoveredBill,
  crsSummary: string,
  absurdityIndex: number,
  parsedVotes: ParsedVote[],
): Promise<BillEvolutionStage[] | null> {
  if (!data.actions || data.actions.length === 0) return null;

  const billNumber = formatBillNumber(bill.bill_type, bill.bill_number);
  const originChamber = bill.bill_type.startsWith('s') ? 'senate' : 'house';

  const actionsText = data.actions.slice(0, 50)
    .map((a: any) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  const amendmentText = data.amendments.slice(0, 15)
    .map((a: any) => `${a.number}: ${a.description || a.purpose || 'No description'}`)
    .join('\n');

  const voteText = parsedVotes
    .map(v => `${v.actionDate}: ${v.chamber} vote ${v.yeas}-${v.nays} (${v.passed ? 'passed' : 'failed'})`)
    .join('\n');

  const prompt = `You are generating a bill evolution timeline for AbsurdityIndex.org — a satirical editorial site.

BILL: ${billNumber} — ${bill.title}
ORIGIN CHAMBER: ${originChamber}
ABSURDITY SCORE: ${absurdityIndex}/10

CRS SUMMARY:
${crsSummary || '(Not available)'}

ACTIONS:
${actionsText}

AMENDMENTS:
${amendmentText || '(None)'}

VOTES:
${voteText || '(None recorded)'}

Generate 2-5 bill evolution stages in chronological order. Each stage maps to the bill's legislative journey.

VALID STAGES (use ONLY these exact strings):
- "introduced" — When bill was first filed
- "origin-committee" — Referred to or acted on in origin chamber's committee
- "origin-reported" — Reported out of committee
- "origin-passed" — Passed the origin chamber
- "receiving-received" — Received by other chamber
- "receiving-committee" — In other chamber's committee
- "receiving-passed" — Passed other chamber without changes
- "receiving-amended" — Passed other chamber WITH changes
- "conference-report-filed" — Conference committee report
- "enrolled" — Enrolled for presidential signature
- "signed" — President signed
- "became-law" — Became law
- "died-in-committee" — Never left committee
- "expired" — Congress ended without final action

FOR EACH STAGE provide:
- stage: One of the valid stage strings above
- chamber: "house", "senate", "both", or "president"
- date: YYYY-MM-DD
- paraphrasedText: 1-2 witty sentences describing what happened at this stage. Be editorial, not dry.
- cumulativePork: Running total estimate in dollars (integer). Start at 0. If the CRS summary or amendments mention dollar amounts, use them. If no spending info, keep at 0.
- porkAddedThisStage: Amount added this stage (integer, can be 0)
- keyChanges: Array of 1-4 bullet points about what happened
- vote: Include ONLY if a recorded vote happened at this stage: {yeas, nays, passed, chamber}
- porkItems: If you can identify specific spending items from the summary/amendments, include 1-3 per stage:
  {description, amount (integer dollars), addedBy (sponsor name), category ("earmark"|"program-expansion"|"new-program"|"tax-expenditure"|"hidden-cost"), satiricalNote (one dry quip)}

RULES:
- Stages MUST be unique — no duplicate stage names
- Be witty in paraphrasedText but factually accurate
- For pork estimates: ONLY include amounts you can justify from the bill text/summary. Don't make up numbers.
- If the bill has no spending component, set all pork values to 0
- satiricalNote should be dry, observational humor — not mean-spirited

Respond in this exact JSON format (no markdown, just JSON):
{
  "stages": [
    {
      "stage": "introduced",
      "chamber": "house",
      "date": "2025-01-03",
      "paraphrasedText": "Another bill enters the legislative thunderdome.",
      "cumulativePork": 0,
      "porkAddedThisStage": 0,
      "keyChanges": ["Introduced and referred to committee"],
      "porkItems": []
    }
  ]
}`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);
  const stages: BillEvolutionStage[] = parsed.stages || [];

  // Inject parsed vote data into matching stages
  for (const stage of stages) {
    if (stage.vote) continue; // AI already included a vote
    const matchingVote = parsedVotes.find(v => v.actionDate === stage.date);
    if (matchingVote) {
      stage.vote = {
        yeas: matchingVote.yeas,
        nays: matchingVote.nays,
        notVoting: matchingVote.notVoting,
        passed: matchingVote.passed,
        chamber: matchingVote.chamber,
        rollCallNumber: matchingVote.rollCallNumber,
        rollCallUrl: matchingVote.rollCallUrl,
      };
    }
  }

  return stages.length > 0 ? stages : null;
}

// ─── AI Editorial Body Content ─────────────────────────────────────────────

async function runAiEditorialBody(
  client: Anthropic,
  bill: DiscoveredBill,
  crsSummary: string,
  data: FullBillData,
  absurdityIndex: number,
  archetype: BillArchetype = 'general',
  namingSessionCount?: number,
): Promise<string> {
  const billNumber = formatBillNumber(bill.bill_type, bill.bill_number);

  const actionsPreview = data.actions.slice(0, 10)
    .map((a: any) => `${a.actionDate}: ${a.text}`)
    .join('\n');

  const archetypeSections = getArchetypeEditorialSections(archetype, namingSessionCount);

  const sectionInstructions = archetypeSections || `Write 2-3 sections using ## headings. Possible sections (pick what fits):
- "## The Process" — How the bill moved (or didn't) through Congress
- "## What's Actually In It" — Plain-English breakdown of key provisions
- "## Notable Provisions" — Standout items worth highlighting
- "## The Fine Print" — Hidden details most people miss
- "## Why This Matters" — Real-world impact (only if not already covered in frontmatter)`;

  const prompt = `You are a writer for AbsurdityIndex.org. Generate markdown sections for a bill detail page.

BILL: ${billNumber} — ${bill.title}
ABSURDITY SCORE: ${absurdityIndex}/10
SPONSOR: ${bill.sponsor} (${bill.sponsor_party}-${bill.sponsor_state})

CRS SUMMARY:
${crsSummary || '(Not available)'}

RECENT ACTIONS:
${actionsPreview || '(None)'}

${sectionInstructions}

TONE: John Oliver meets Wikipedia. Witty, accessible, dry humor. Never preachy or partisan.

RULES:
- Be factually accurate — only reference what's in the CRS summary and actions
- Do NOT make up provisions, dollar amounts, or legislative history
- Keep it concise — each section should be 2-4 sentences or a short bulleted list
- Do NOT include a "Source" section — that's handled by the template
- Start directly with the first ## heading, no intro text`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

// ─── MDX Generation ────────────────────────────────────────────────────────

interface MdxExtras {
  finalVote: ParsedVote | null;
  allVotes: ParsedVote[];
  enrichedCosponsors: EnrichedCosponsor[];
  aiEvolution: BillEvolutionStage[] | null;
  totalPork: number;
  bodyContent: string;
  congressUrl: string;
  archetype: BillArchetype;
  omnibusData: OmnibusData | null;
}

function generateMdx(
  data: FullBillData,
  meta: { congress: number; type: string; number: number; absurdityIndex: number; category: string; featured: boolean },
  aiSummary: { theGist: string; cardSummary: string; whyItMatters: string } | null,
  aiMilestones: Array<{ type: string; date: string; text: string; icon: string }> | null,
  extras: MdxExtras,
): string {
  const b = data.bill;

  const title = (b.title || '').replace(/"/g, '\\"');
  const billNumber = formatBillNumber(meta.type, meta.number);

  const sponsorObj = b.sponsors?.[0];
  const sponsor = sponsorObj
    ? (sponsorObj.fullName || `${sponsorObj.firstName} ${sponsorObj.lastName}`)
    : 'Unknown';
  const sponsorParty = sponsorObj?.party || '';
  const sponsorState = sponsorObj?.state || '';

  const latestAction = b.latestAction;
  const status = latestAction?.text || 'Introduced';
  const dateIntroduced = b.introducedDate || '2025-01-01';
  const dateUpdated = latestAction?.actionDate || null;

  const { congressUrl } = extras;

  const crsSummary = data.summaries.length > 0
    ? stripHtml(data.summaries[data.summaries.length - 1].text)
    : '';

  let shortSummary = aiSummary?.cardSummary || crsSummary;
  if (shortSummary.length > 200) {
    shortSummary = shortSummary.slice(0, 197) + '...';
  }

  const theGist = aiSummary?.theGist || '';
  const whyItMatters = aiSummary?.whyItMatters || '';

  // ─── Votes YAML ────────────────────────────────────────────────────────
  let votesYaml = '';
  if (extras.finalVote) {
    const v = extras.finalVote;
    votesYaml = `votes:
  yeas: ${v.yeas}
  nays: ${v.nays}
  notVoting: ${v.notVoting ?? 0}
  passed: ${v.passed}
  chamber: "${v.chamber}"`;
    if (v.rollCallNumber) {
      votesYaml += `\n  rollCallNumber: ${v.rollCallNumber}`;
    }
    if (v.rollCallUrl) {
      votesYaml += `\n  rollCallUrl: "${v.rollCallUrl}"`;
    }
  }

  // ─── Actions YAML ──────────────────────────────────────────────────────
  const actionsYaml = data.actions.slice(0, 50).map((a: any) => {
    const actionText = escYaml(a.text || '');
    return `  - date: ${a.actionDate || '2000-01-01'}
    text: "${actionText}"
    chamber: ${a.actionCode?.startsWith('H') ? 'house' : a.actionCode?.startsWith('S') ? 'senate' : 'both'}`;
  }).join('\n');

  // ─── Key Milestones YAML ───────────────────────────────────────────────
  const keyMilestonesYaml = aiMilestones && aiMilestones.length > 0
    ? aiMilestones.map(m => {
        return `  - type: "${escYaml(m.type)}"
    date: ${m.date}
    text: "${escYaml(m.text)}"
    icon: "${m.icon}"`;
      }).join('\n')
    : '';

  // ─── Cosponsors YAML (enriched) ───────────────────────────────────────
  const cosponsorsYaml = extras.enrichedCosponsors.map(c => {
    let yaml = `  - name: "${escYaml(c.name)}"
    party: "${c.party}"
    state: "${c.state}"`;
    return yaml;
  }).join('\n');

  // ─── Amendments YAML ──────────────────────────────────────────────────
  const amendmentsYaml = data.amendments.slice(0, 20).map((a: any) => {
    const desc = escYaml((a.description || a.purpose || '').slice(0, 200));
    return `  - number: "${a.number || 'Unknown'}"
    description: "${desc}"`;
  }).join('\n');

  // ─── Related Bills YAML ───────────────────────────────────────────────
  const relatedBillsYaml = data.relatedBills.slice(0, 10).map((r: any) => {
    const num = (r.number || '').toString();
    const relTitle = escYaml((r.title || '').slice(0, 100));
    return `  - billNumber: "${r.type?.toUpperCase() || ''} ${num}"
    title: "${relTitle}"
    relationship: "${r.relationshipDetails?.[0]?.type || 'Related'}"`;
  }).join('\n');

  // ─── Text Versions YAML ──────────────────────────────────────────────
  const textVersionsYaml = data.textVersions.map((t: any) => {
    return `  - type: "${t.type || 'Unknown'}"
    date: ${t.date || '2000-01-01'}`;
  }).join('\n');

  // ─── Subjects / Policy Area / Tags ────────────────────────────────────
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const policyArea = data.policyArea?.name || b.policyArea?.name || subjects?.[0]?.name || meta.category;
  const tags = subjects.slice(0, 10).map((s: any) => `"${escYaml(s.name || '')}"`).join(', ');

  // ─── Bill Evolution YAML ──────────────────────────────────────────────
  let billEvolutionYaml = '';
  if (extras.aiEvolution && extras.aiEvolution.length > 0) {
    const stageEntries = extras.aiEvolution.map(stage => {
      let yaml = `  - stage: ${stage.stage}
    date: ${stage.date}
    paraphrasedText: "${escYaml(stage.paraphrasedText)}"
    cumulativePork: ${stage.cumulativePork}
    porkAddedThisStage: ${stage.porkAddedThisStage}
    keyChanges:`;

      for (const change of stage.keyChanges || []) {
        yaml += `\n      - "${escYaml(change)}"`;
      }

      if (stage.vote) {
        yaml += `\n    vote:
      yeas: ${stage.vote.yeas}
      nays: ${stage.vote.nays}
      passed: ${stage.vote.passed}
      chamber: "${stage.vote.chamber}"`;
        if (stage.vote.notVoting != null) {
          yaml += `\n      notVoting: ${stage.vote.notVoting}`;
        }
        if (stage.vote.rollCallNumber) {
          yaml += `\n      rollCallNumber: ${stage.vote.rollCallNumber}`;
        }
        if (stage.vote.rollCallUrl) {
          yaml += `\n      rollCallUrl: "${stage.vote.rollCallUrl}"`;
        }
      }

      if (stage.porkItems && stage.porkItems.length > 0) {
        yaml += `\n    porkItems:`;
        for (const item of stage.porkItems) {
          yaml += `\n      - description: "${escYaml(item.description)}"
        amount: ${item.amount}
        addedBy: "${escYaml(item.addedBy)}"
        category: ${item.category}`;
          if (item.satiricalNote) {
            yaml += `\n        satiricalNote: "${escYaml(item.satiricalNote)}"`;
          }
        }
      } else {
        yaml += `\n    porkItems: []`;
      }

      return yaml;
    });

    billEvolutionYaml = `billEvolution:\n${stageEntries.join('\n\n')}`;
  }

  // ─── Omnibus Data YAML ──────────────────────────────────────────────────
  let omnibusYaml = '';
  if (extras.archetype === 'omnibus' && extras.omnibusData) {
    const od = extras.omnibusData;
    let yaml = `isOmnibus: true
omnibusData:
  totalSpending: ${od.totalSpending}
  pageCount: ${od.pageCount}
  divisions:`;
    for (const div of od.divisions) {
      yaml += `\n    - title: "${escYaml(div.title)}"`;
      if (div.shortTitle) yaml += `\n      shortTitle: "${escYaml(div.shortTitle)}"`;
      yaml += `\n      spending: ${div.spending}`;
      if (div.description) yaml += `\n      description: "${escYaml(div.description)}"`;
    }
    if (od.riders && od.riders.length > 0) {
      yaml += `\n  riders:`;
      for (const rider of od.riders) {
        yaml += `\n    - title: "${escYaml(rider.title)}"
      description: "${escYaml(rider.description)}"`;
        if (rider.category) yaml += `\n      category: "${rider.category}"`;
      }
    }
    if (od.timeline && od.timeline.length > 0) {
      yaml += `\n  timeline:`;
      for (const evt of od.timeline) {
        yaml += `\n    - date: ${evt.date}
      event: "${escYaml(evt.event)}"`;
      }
    }
    omnibusYaml = yaml;
  }

  // ─── Assemble Frontmatter ─────────────────────────────────────────────
  const frontmatter = `---
title: "${title}"
billNumber: "${billNumber}"
billType: "real"
category: "${policyArea}"
tags: [${tags}]

sponsor: "${sponsor}"
sponsorParty: "${sponsorParty}"
sponsorState: "${sponsorState}"
cosponsorCount: ${data.cosponsors.length}
${cosponsorsYaml ? `cosponsors:\n${cosponsorsYaml}` : 'cosponsors: []'}

committee: "${data.committees[0]?.name || 'Not assigned'}"

status: "${escYaml(status)}"
dateIntroduced: ${dateIntroduced}
${dateUpdated ? `dateUpdated: ${dateUpdated}` : ''}

${votesYaml}

${actionsYaml ? `actions:\n${actionsYaml}` : ''}

${keyMilestonesYaml ? `keyMilestones:\n${keyMilestonesYaml}` : ''}

summary: "${escYaml(shortSummary)}"
${theGist ? `theGist: "${escYaml(theGist)}"` : ''}
${whyItMatters ? `whyItMatters: "${escYaml(whyItMatters)}"` : ''}
${crsSummary ? `crsSummary: "${escYaml(crsSummary).slice(0, 2000)}"` : ''}

${extras.totalPork > 0 ? `totalPork: ${extras.totalPork}` : ''}

${billEvolutionYaml}

amendmentCount: ${data.amendments.length}
${amendmentsYaml ? `amendments:\n${amendmentsYaml}` : ''}

${relatedBillsYaml ? `relatedBills:\n${relatedBillsYaml}` : ''}

${textVersionsYaml ? `textVersions:\n${textVersionsYaml}` : ''}

${omnibusYaml}

absurdityIndex: ${meta.absurdityIndex}
congressDotGovUrl: "${congressUrl}"
congressNumber: ${meta.congress}
featured: ${meta.featured || false}
---

${extras.bodyContent || `> **Source:** Real bill from the ${meta.congress}th Congress. Data from [Congress.gov](${congressUrl}).`}

> **Source:** Real bill from the ${meta.congress}th Congress. [View on Congress.gov](${congressUrl}).
>
> **Disclaimer:** The absurdity score and editorial commentary above represent this site's opinion. Bill details should be verified at Congress.gov.
`;

  return frontmatter;
}
