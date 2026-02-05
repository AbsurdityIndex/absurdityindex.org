import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { loadBill, loadBills } from '../modules/bills/loader.js';
import { formatTweet, formatThread, billUrl, cleanContent } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import type { PromptType, PromptContext } from '../modules/claude/prompts/index.js';

export function registerDraftCommand(program: Command): void {
  const draft = program.command('draft').description('Generate draft posts without posting');

  draft
    .command('bill')
    .description('Draft a post about a specific bill')
    .requiredOption('--slug <slug>', 'Bill slug (e.g., real-hr-25)')
    .option('--type <type>', 'Prompt type (bill-roast, pork-barrel-report, cspan-after-dark)', 'bill-roast')
    .option('--dry-run', 'Skip saving to database')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const spinner = ora('Generating draft...').start();

      try {
        const bill = loadBill(config.billsDir, opts.slug);
        if (!bill) {
          spinner.fail(`Bill not found: ${opts.slug}`);
          return;
        }

        const claude = new ClaudeClient(config);
        const context: PromptContext = {
          bill,
          siteUrl: billUrl(bill.slug, config.siteUrl),
        };

        const result = await claude.generate(opts.type as PromptType, context);
        const content = cleanContent(result.content);

        spinner.succeed('Draft generated');
        console.log('\n' + chalk.cyan('━'.repeat(50)));
        console.log(chalk.bold('Draft:'));
        console.log(content);
        console.log(chalk.cyan('━'.repeat(50)));
        console.log(chalk.dim(`Type: ${result.promptType} | Tokens: ${result.tokensUsed} | Length: ${content.length}/280`));

        // Run safety check
        const safetySpinner = ora('Running safety check...').start();
        const safety = await runHotPotDetector({ content, claude, config });
        const verdictColor = safety.verdict === 'SAFE' ? chalk.green : safety.verdict === 'REVIEW' ? chalk.yellow : chalk.red;
        safetySpinner.succeed(`Safety: ${verdictColor(safety.verdict)} (score: ${safety.score})`);

        if (safety.reasons.length > 0) {
          console.log(chalk.dim('Reasons: ' + safety.reasons.join(', ')));
        }

        if (!opts.dryRun) {
          const db = getDb(config.dbPath);
          const posts = createPostModel(db);
          const post = posts.create({
            content,
            prompt_type: result.promptType,
            bill_slug: opts.slug,
            safety_score: safety.score,
            safety_verdict: safety.verdict,
            status: 'draft',
          });
          console.log(chalk.dim(`Saved as draft #${post.id}`));
        }
      } catch (err) {
        spinner.fail('Draft generation failed');
        console.error(err);
      }
    });

  draft
    .command('batch')
    .description('Generate multiple draft posts')
    .option('--count <n>', 'Number of drafts to generate', '5')
    .option('--type <type>', 'Prompt type filter')
    .option('--dry-run', 'Skip saving to database')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const count = parseInt(opts.count, 10);

      console.log(chalk.bold(`Generating ${count} drafts...`));

      const bills = loadBills(config.billsDir);
      const claude = new ClaudeClient(config);
      const db = opts.dryRun ? null : getDb(config.dbPath);
      const posts = db ? createPostModel(db) : null;

      // Pick random bills with high absurdity
      const sortedBills = bills
        .filter(b => b.absurdityIndex && b.absurdityIndex >= 5)
        .sort(() => Math.random() - 0.5)
        .slice(0, count);

      const promptTypes: PromptType[] = ['bill-roast', 'cspan-after-dark', 'pork-barrel-report'];

      for (let i = 0; i < Math.min(count, sortedBills.length); i++) {
        const bill = sortedBills[i]!;
        const promptType = opts.type as PromptType ?? promptTypes[i % promptTypes.length]!;
        const spinner = ora(`[${i + 1}/${count}] ${bill.billNumber}...`).start();

        try {
          const result = await claude.generate(promptType, {
            bill,
            siteUrl: billUrl(bill.slug, config.siteUrl),
          });
          const content = cleanContent(result.content);

          const safety = await runHotPotDetector({ content, claude, config });
          const verdictColor = safety.verdict === 'SAFE' ? chalk.green : safety.verdict === 'REVIEW' ? chalk.yellow : chalk.red;

          spinner.succeed(`${bill.billNumber} → ${verdictColor(safety.verdict)} (${content.length} chars)`);
          console.log(chalk.dim(`  ${content.slice(0, 100)}...`));

          if (posts) {
            posts.create({
              content,
              prompt_type: promptType,
              bill_slug: bill.slug,
              safety_score: safety.score,
              safety_verdict: safety.verdict,
              status: 'draft',
            });
          }
        } catch (err) {
          spinner.fail(`${bill.billNumber} failed`);
        }
      }

      console.log(chalk.bold(`\nDone. Generated ${Math.min(count, sortedBills.length)} drafts.`));
    });
}
