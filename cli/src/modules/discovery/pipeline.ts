import type Database from 'better-sqlite3';
import chalk from 'chalk';
import { getLogger } from '../../utils/logger.js';
import { CongressApi, type BrowsedBill } from './congress-api.js';
import { prefilterBill, type PrefilterResult } from './pre-filter.js';
import { AbsurdityScorer } from './scorer.js';
import { createDiscoveredBillModel, type DiscoveredBill } from '../state/models/discovered-bills.js';
import { createGenerationModel } from '../state/models/generations.js';
import { loadBills } from '../bills/loader.js';

export interface ScanOptions {
  congress: number;
  type: string; // 'hr' | 's' | 'all'
  days: number;
  limit: number;
  prefilterThreshold: number;
  aiThreshold: number;
  dryRun: boolean;
}

export interface ScanResult {
  browsed: number;
  skippedExisting: number;
  prefilterPassed: number;
  aiScored: number;
  candidates: number;
  costCents: number;
}

const SCORER_MODEL = 'claude-haiku-4-5-20251001';

export async function runScan(
  db: Database.Database,
  api: CongressApi,
  scorer: AbsurdityScorer,
  billsDir: string,
  opts: ScanOptions,
): Promise<ScanResult> {
  const log = getLogger();
  const model = createDiscoveredBillModel(db);
  const generations = createGenerationModel(db);
  const result: ScanResult = {
    browsed: 0,
    skippedExisting: 0,
    prefilterPassed: 0,
    aiScored: 0,
    candidates: 0,
    costCents: 0,
  };

  // Load existing MDX slugs to skip
  const existingBills = loadBills(billsDir);
  const existingSlugs = new Set(existingBills.map(b => b.slug));

  // Determine types to browse
  const types = opts.type === 'all' ? ['hr', 's'] : [opts.type];

  // Calculate fromDate
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - opts.days);
  const fromDateStr = fromDate.toISOString().split('T')[0]!;

  // ─── Stage 1: Browse ──────────────────────────────────────────────────
  console.log(chalk.bold('\n  Stage 1: Browse Congress.gov'));
  console.log(chalk.dim(`  Looking back ${opts.days} days from ${fromDateStr}`));

  const allBrowsed: BrowsedBill[] = [];

  for (const type of types) {
    console.log(chalk.dim(`  Browsing ${type.toUpperCase()} bills...`));
    const bills = await api.browse({
      congress: opts.congress,
      type,
      fromDate: fromDateStr,
      limit: opts.limit,
    });
    console.log(`  Found ${chalk.cyan(String(bills.length))} ${type.toUpperCase()} bills`);
    allBrowsed.push(...bills);
  }

  result.browsed = allBrowsed.length;

  // Filter out bills we already know about (in DB or as MDX files)
  const newBills: BrowsedBill[] = [];
  for (const bill of allBrowsed) {
    const slug = `real-${bill.billType}-${bill.billNumber}-${bill.congress}`;
    if (existingSlugs.has(slug)) {
      result.skippedExisting++;
      continue;
    }
    if (model.exists(bill.congress, bill.billType, bill.billNumber)) {
      result.skippedExisting++;
      continue;
    }
    newBills.push(bill);
  }

  console.log(`  New bills: ${chalk.cyan(String(newBills.length))} (skipped ${result.skippedExisting} existing)`);

  if (newBills.length === 0) {
    console.log(chalk.yellow('\n  No new bills to process.'));
    return result;
  }

  // ─── Stage 2: Pre-filter ──────────────────────────────────────────────
  console.log(chalk.bold('\n  Stage 2: Heuristic Pre-filter'));
  console.log(chalk.dim(`  Threshold: ${opts.prefilterThreshold}`));

  const passedBills: Array<{ bill: BrowsedBill; record: DiscoveredBill; prefilter: PrefilterResult }> = [];

  for (const bill of newBills) {
    // Upsert into DB
    const record = opts.dryRun
      ? { id: 0 } as DiscoveredBill
      : model.upsert({
          congress: bill.congress,
          billType: bill.billType,
          billNumber: bill.billNumber,
          title: bill.title,
          sponsor: bill.sponsor,
          sponsorParty: bill.sponsorParty,
          sponsorState: bill.sponsorState,
          policyArea: bill.policyArea,
          latestActionText: bill.latestActionText,
          latestActionDate: bill.latestActionDate,
          congressGovUrl: bill.congressGovUrl,
        });

    const pf = prefilterBill(
      bill.title,
      bill.policyArea,
      bill.latestActionText,
      0, // cosponsor count not available at browse stage
      opts.prefilterThreshold,
    );

    if (!opts.dryRun) {
      model.setPrefilter(record.id, pf.score, pf.signals, pf.passed);
    }

    if (pf.passed) {
      passedBills.push({ bill, record, prefilter: pf });
    }
  }

  result.prefilterPassed = passedBills.length;
  console.log(`  Passed: ${chalk.green(String(passedBills.length))} / ${newBills.length}`);

  if (passedBills.length === 0) {
    console.log(chalk.yellow('\n  No bills passed pre-filter.'));
    return result;
  }

  // Show top pre-filter hits
  passedBills.sort((a, b) => b.prefilter.score - a.prefilter.score);
  console.log(chalk.dim('\n  Top pre-filter scores:'));
  for (const { bill, prefilter } of passedBills.slice(0, 5)) {
    console.log(chalk.dim(`    ${String(prefilter.score).padStart(3)} [${prefilter.signals.join(', ')}] ${bill.title.slice(0, 70)}`));
  }

  // ─── Stage 3: Detail Fetch ────────────────────────────────────────────
  console.log(chalk.bold('\n  Stage 3: Fetch Details'));
  console.log(chalk.dim(`  Enriching ${passedBills.length} bills (3 API calls each)...`));

  const enrichedBills: Array<{
    bill: BrowsedBill;
    record: DiscoveredBill;
    prefilter: PrefilterResult;
    subjects: string[];
    summaryText: string;
    cosponsorCount: number;
  }> = [];

  for (const entry of passedBills) {
    try {
      const detail = await api.fetchDetail(
        entry.bill.congress,
        entry.bill.billType,
        entry.bill.billNumber,
      );
      enrichedBills.push({
        ...entry,
        subjects: detail.subjects,
        summaryText: detail.summaryText,
        cosponsorCount: detail.cosponsorCount,
      });
    } catch (err: any) {
      log.debug({ err: err.message, bill: entry.bill.title }, 'Failed to fetch detail');
    }
  }

  console.log(`  Enriched: ${chalk.cyan(String(enrichedBills.length))}`);

  // ─── Stage 4: AI Scoring ──────────────────────────────────────────────
  console.log(chalk.bold('\n  Stage 4: AI Scoring (Haiku)'));
  console.log(chalk.dim(`  Scoring ${enrichedBills.length} bills...`));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const entry of enrichedBills) {
    const { bill } = entry;
    const billTypePrefix = bill.billType === 'hr' ? 'H.R.' : bill.billType === 's' ? 'S.' : bill.billType.toUpperCase() + '.';

    try {
      const scoreResult = await scorer.score({
        title: bill.title,
        billNumber: `${billTypePrefix} ${bill.billNumber}`,
        congress: bill.congress,
        sponsor: bill.sponsor,
        sponsorParty: bill.sponsorParty,
        sponsorState: bill.sponsorState,
        policyArea: bill.policyArea,
        subjects: entry.subjects,
        latestAction: bill.latestActionText,
        latestActionDate: bill.latestActionDate,
        cosponsorCount: entry.cosponsorCount,
        summaryText: entry.summaryText,
      });

      totalInputTokens += scoreResult.inputTokens;
      totalOutputTokens += scoreResult.outputTokens;

      if (!opts.dryRun) {
        model.setAiScore(entry.record.id, {
          score: scoreResult.score,
          explanation: scoreResult.explanation,
          category: scoreResult.category,
          angle: scoreResult.angle,
          subjectsJson: JSON.stringify(entry.subjects),
          summaryText: entry.summaryText,
          cosponsorCount: entry.cosponsorCount,
          threshold: opts.aiThreshold,
        });

        generations.record({
          purpose: 'discovery-scoring',
          model: SCORER_MODEL,
          inputTokens: scoreResult.inputTokens,
          outputTokens: scoreResult.outputTokens,
        });
      }

      result.aiScored++;

      const icon = scoreResult.score >= opts.aiThreshold ? chalk.green('✓') : chalk.dim('·');
      console.log(`  ${icon} ${chalk.cyan(String(scoreResult.score).padStart(2))} [${scoreResult.category}] ${bill.title.slice(0, 60)}`);

      if (scoreResult.score >= opts.aiThreshold) {
        result.candidates++;
        if (scoreResult.angle) {
          console.log(chalk.dim(`       → ${scoreResult.angle}`));
        }
      }
    } catch (err: any) {
      log.warn({ err: err.message, title: bill.title }, 'AI scoring failed');
    }
  }

  // Calculate cost
  const { calculateCostCents } = await import('../../utils/pricing.js');
  result.costCents = calculateCostCents(SCORER_MODEL, totalInputTokens, totalOutputTokens);

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(chalk.bold('\n  Scan Complete'));
  console.log(`  Browsed:    ${chalk.cyan(String(result.browsed))}`);
  console.log(`  New:        ${chalk.cyan(String(newBills.length))}`);
  console.log(`  Pre-filter: ${chalk.green(String(result.prefilterPassed))} passed`);
  console.log(`  AI scored:  ${chalk.cyan(String(result.aiScored))}`);
  console.log(`  Candidates: ${chalk.yellow(String(result.candidates))} (score >= ${opts.aiThreshold})`);
  console.log(`  Cost:       ${chalk.dim(`$${(result.costCents / 100).toFixed(4)}`)}`);

  if (opts.dryRun) {
    console.log(chalk.yellow('\n  [DRY RUN — nothing saved to database]'));
  }

  return result;
}
