import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getDb } from '../modules/state/db.js';
import { CongressApi } from '../modules/discovery/congress-api.js';
import { AbsurdityScorer } from '../modules/discovery/scorer.js';
import { runScan } from '../modules/discovery/pipeline.js';
import { createDiscoveredBillModel } from '../modules/state/models/discovered-bills.js';
import { ingestBill } from '../modules/discovery/ingest.js';

export function registerDiscoverCommand(program: Command): void {
  const discover = program
    .command('discover')
    .description('Automatic absurdity discovery pipeline — find and score new congressional bills');

  // ─── scan ─────────────────────────────────────────────────────────────
  discover
    .command('scan')
    .description('Browse Congress.gov, pre-filter, and AI-score new bills')
    .option('--congress <n>', 'Congress number', '119')
    .option('--type <type>', 'Bill type: hr, s, or all', 'all')
    .option('--days <n>', 'Lookback window in days', '7')
    .option('--limit <n>', 'Max bills to browse', '250')
    .option('--prefilter-threshold <n>', 'Min heuristic score to send to AI', '12')
    .option('--ai-threshold <n>', 'Min AI score to flag as candidate', '7')
    .option('--dry-run', 'Show results without saving to database')
    .action(async (opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);

      if (!config.congressApiKey) {
        console.error(chalk.red('Error: CONGRESS_API_KEY is required. Set it in cli/.env'));
        process.exit(1);
      }
      if (!config.anthropicApiKey) {
        console.error(chalk.red('Error: ANTHROPIC_API_KEY is required for AI scoring.'));
        process.exit(1);
      }

      const api = new CongressApi(config.congressApiKey);
      const scorer = new AbsurdityScorer(config.anthropicApiKey);

      console.log(chalk.bold('\n  Absurdity Discovery Pipeline'));
      console.log(chalk.dim('  ═'.repeat(25)));

      await runScan(db, api, scorer, config.billsDir, {
        congress: parseInt(opts.congress, 10),
        type: opts.type,
        days: parseInt(opts.days, 10),
        limit: parseInt(opts.limit, 10),
        prefilterThreshold: parseInt(opts.prefilterThreshold, 10),
        aiThreshold: parseInt(opts.aiThreshold, 10),
        dryRun: opts.dryRun ?? false,
      });

      console.log('');
    });

  // ─── candidates ───────────────────────────────────────────────────────
  discover
    .command('candidates')
    .description('List high-scoring candidate bills')
    .option('--min-score <n>', 'Minimum AI score', '7')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const model = createDiscoveredBillModel(db);

      const minScore = parseInt(opts.minScore, 10);
      const limit = parseInt(opts.limit, 10);
      const candidates = model.getCandidates(minScore, limit);

      if (opts.json) {
        const output = candidates.map(c => ({
          id: c.id,
          congress: c.congress,
          billType: c.bill_type,
          billNumber: c.bill_number,
          title: c.title,
          sponsor: c.sponsor,
          sponsorParty: c.sponsor_party,
          aiScore: c.ai_score,
          aiCategory: c.ai_category,
          aiAngle: c.ai_angle,
          congressGovUrl: c.congress_gov_url,
          discoveredAt: c.discovered_at,
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      if (candidates.length === 0) {
        console.log(chalk.yellow('\n  No candidates found. Run `discover scan` first.\n'));
        return;
      }

      console.log(chalk.bold(`\n  Candidate Bills (score >= ${minScore})`));
      console.log(chalk.dim('  ═'.repeat(25)));

      for (const c of candidates) {
        const prefix = c.bill_type === 'hr' ? 'H.R.' : c.bill_type === 's' ? 'S.' : c.bill_type.toUpperCase() + '.';
        console.log(`\n  ${chalk.cyan(`[${c.ai_score}]`)} ${chalk.bold(`${prefix} ${c.bill_number}`)} — ${c.title.slice(0, 65)}`);
        console.log(chalk.dim(`       ID: ${c.id} | ${c.ai_category} | ${c.sponsor_party ? `${c.sponsor} (${c.sponsor_party}-${c.sponsor_state})` : c.sponsor}`));
        if (c.ai_angle) {
          console.log(chalk.yellow(`       → ${c.ai_angle}`));
        }
        if (c.congress_gov_url) {
          console.log(chalk.dim(`       ${c.congress_gov_url}`));
        }
      }

      console.log(chalk.dim(`\n  ${candidates.length} candidate(s). Use \`discover ingest --id <ID>\` to generate MDX.\n`));
    });

  // ─── ingest ───────────────────────────────────────────────────────────
  discover
    .command('ingest')
    .description('Generate MDX files from candidate bills')
    .option('--id <id>', 'Ingest a specific bill by DB id')
    .option('--auto', 'Auto-ingest all candidates scoring >= 8')
    .option('--dry-run', 'Show MDX preview without writing files')
    .action(async (opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const model = createDiscoveredBillModel(db);

      if (!config.congressApiKey) {
        console.error(chalk.red('Error: CONGRESS_API_KEY is required.'));
        process.exit(1);
      }
      if (!config.anthropicApiKey) {
        console.error(chalk.red('Error: ANTHROPIC_API_KEY is required for ingest.'));
        process.exit(1);
      }

      const api = new CongressApi(config.congressApiKey);
      const dryRun = opts.dryRun ?? false;

      let billsToIngest: Array<import('../modules/state/models/discovered-bills.js').DiscoveredBill> = [];

      if (opts.id) {
        const bill = model.getById(parseInt(opts.id, 10));
        if (!bill) {
          console.error(chalk.red(`Bill with ID ${opts.id} not found.`));
          process.exit(1);
        }
        if (bill.status === 'ingested') {
          console.error(chalk.yellow(`Bill ${opts.id} already ingested as ${bill.ingested_slug}.`));
          process.exit(1);
        }
        billsToIngest.push(bill);
      } else if (opts.auto) {
        billsToIngest = model.getCandidates(8, 50);
        if (billsToIngest.length === 0) {
          console.log(chalk.yellow('\n  No candidates scoring >= 8 to auto-ingest.\n'));
          return;
        }
        console.log(chalk.bold(`\n  Auto-ingesting ${billsToIngest.length} bill(s) scoring >= 8`));
      } else {
        console.error(chalk.red('Error: specify --id <id> or --auto'));
        process.exit(1);
      }

      const results = [];
      for (const bill of billsToIngest) {
        try {
          const result = await ingestBill(
            db, api, config.anthropicApiKey, config.billsDir, bill, dryRun,
          );
          results.push(result);
        } catch (err: any) {
          console.error(chalk.red(`  Failed: ${bill.title.slice(0, 50)} — ${err.message}`));
        }
      }

      if (results.length > 0) {
        console.log(chalk.bold('\n  Ingest Complete'));
        for (const r of results) {
          console.log(`  ${chalk.green('✓')} ${r.slug} (absurdity: ${r.absurdityIndex})`);
        }
      }
      console.log('');
    });

  // ─── stats ────────────────────────────────────────────────────────────
  discover
    .command('stats')
    .description('Show discovery scan history and cost summary')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);
      const db = getDb(config.dbPath);
      const model = createDiscoveredBillModel(db);

      const stats = model.getStats();

      console.log(chalk.bold('\n  Discovery Stats'));
      console.log(chalk.dim('  ═'.repeat(25)));

      console.log(`\n  Total discovered:  ${chalk.cyan(String(stats.total))}`);
      console.log(`  Last scan:         ${chalk.dim(stats.lastScanAt ?? 'Never')}`);
      console.log(`  Avg AI score:      ${chalk.cyan(stats.avgAiScore.toFixed(1))}`);

      if (Object.keys(stats.byStatus).length > 0) {
        console.log(chalk.bold('\n  By Status'));
        for (const [status, count] of Object.entries(stats.byStatus)) {
          const color = status === 'candidate' ? chalk.yellow
            : status === 'ingested' ? chalk.green
            : status === 'filtered-out' ? chalk.dim
            : chalk.white;
          console.log(`    ${color(status.padEnd(14))} ${count}`);
        }
      }

      if (stats.topCategories.length > 0) {
        console.log(chalk.bold('\n  Top Categories'));
        for (const cat of stats.topCategories) {
          console.log(`    ${cat.category.padEnd(22)} ${chalk.dim(String(cat.count))}`);
        }
      }

      // Recent discovery rate
      const last7 = model.countRecent(7);
      const last30 = model.countRecent(30);
      console.log(chalk.bold('\n  Discovery Rate'));
      console.log(`    Last 7 days:  ${chalk.cyan(String(last7))}`);
      console.log(`    Last 30 days: ${chalk.cyan(String(last30))}`);

      console.log('');
    });
}
