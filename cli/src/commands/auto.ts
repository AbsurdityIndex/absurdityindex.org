import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger, getLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { XReadClient } from '../modules/x-api/client.js';
import { BrowserPoster } from '../modules/x-api/browser-poster.js';
import { fetchXTrends } from '../modules/trending/x-trends.js';
import { fetchCongressActions } from '../modules/trending/congress-watch.js';
import { fetchRssFeeds } from '../modules/trending/rss-feeds.js';
import { aggregateTrends } from '../modules/trending/aggregator.js';
import { loadBills } from '../modules/bills/loader.js';
import { matchTrendToBills } from '../modules/bills/matcher.js';
import { scoreTrend } from '../modules/scoring/composite-scorer.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createCooldownManager } from '../modules/scheduler/cooldown.js';
import { schedule, stopAll } from '../modules/scheduler/cron.js';
import { cleanContent, formatTweet, billUrl } from '../utils/format.js';
import type { PromptContext } from '../modules/claude/prompts/index.js';

export function registerAutoCommand(program: Command): void {
  const auto = program.command('auto').description('Full autopilot mode (YOLO)');

  auto
    .command('start')
    .description('Start YOLO autopilot — monitors, generates, and posts automatically')
    .option('--max-posts-per-day <n>', 'Daily post cap', '8')
    .option('--interval <minutes>', 'Check interval in minutes', '30')
    .option('--dry-run', 'Run full pipeline without posting')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      const log = createLogger(config.logLevel);
      const maxPerDay = parseInt(opts.maxPostsPerDay, 10);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const cooldowns = createCooldownManager(db);
      const bills = loadBills(config.billsDir);
      const claude = new ClaudeClient(config);
      const xClient = new XReadClient(config);
      const poster = new BrowserPoster(config);

      console.log(chalk.bold.yellow('\n🚀 YOLO MODE ACTIVATED'));
      console.log(chalk.dim(`Max ${maxPerDay} posts/day | Check every ${opts.interval}min | ${config.dryRun ? 'DRY RUN' : 'LIVE'}`));
      console.log(chalk.dim(`Loaded ${bills.length} bills from site\n`));

      const runCycle = async () => {
        log.info('Auto cycle starting');

        // Check daily cap
        const todayCount = posts.countToday();
        if (todayCount >= maxPerDay) {
          log.info({ todayCount, maxPerDay }, 'Daily cap reached');
          console.log(chalk.yellow(`  Daily cap reached (${todayCount}/${maxPerDay}). Sleeping.`));
          return;
        }

        const remaining = maxPerDay - todayCount;
        console.log(chalk.dim(`\n  Posts today: ${todayCount}/${maxPerDay} (${remaining} remaining)`));

        // 1. Scan trends
        const spinner = ora('Scanning trends...').start();
        const [xTrends, congressTrends, rssTrends] = await Promise.all([
          fetchXTrends(xClient),
          fetchCongressActions(config),
          fetchRssFeeds(config.dataDir),
        ]);
        const aggregated = aggregateTrends(xTrends, congressTrends, rssTrends);
        spinner.succeed(`${aggregated.length} trends found`);

        // 2. Score and filter
        const scored = aggregated
          .map(t => ({ ...t, score: scoreTrend(t, config) }))
          .filter(t => t.score >= 40) // Minimum relevance
          .filter(t => cooldowns.canPost(t.topic))
          .sort((a, b) => b.score - a.score);

        if (scored.length === 0) {
          console.log(chalk.dim('  No high-quality trends. Using bill-based content.'));
          // Fall back to bill-based content
          const highAbsurdity = bills
            .filter(b => (b.absurdityIndex ?? 0) >= 6)
            .filter(b => cooldowns.canPost(b.slug))
            .sort(() => Math.random() - 0.5);

          if (highAbsurdity.length === 0) {
            console.log(chalk.dim('  No eligible bills either. Skipping cycle.'));
            return;
          }

          const bill = highAbsurdity[0]!;
          await generateAndPost(bill.slug, { bill, siteUrl: billUrl(bill.slug, config.siteUrl) });
          return;
        }

        // 3. Process top trend
        const topTrend = scored[0]!;
        console.log(chalk.cyan(`  Top trend: ${topTrend.topic} (score: ${topTrend.score})`));

        // 4. Match to bills
        const billMatches = matchTrendToBills(topTrend, bills);
        const matchedBill = billMatches[0]?.bill;

        const context: PromptContext = {
          trendTopic: topTrend.topic,
          bill: matchedBill,
          siteUrl: matchedBill ? billUrl(matchedBill.slug, config.siteUrl) : undefined,
        };

        await generateAndPost(topTrend.topic, context);

        async function generateAndPost(topic: string, ctx: PromptContext) {
          // 5. Pick prompt type
          const promptType = await claude.pickBestPromptType(ctx);
          log.info({ promptType, topic }, 'Prompt type selected');

          // 6. Generate content
          const genSpinner = ora(`Generating ${promptType}...`).start();
          const result = await claude.generate(promptType, ctx);
          const content = cleanContent(result.content);

          if (content === 'SKIP') {
            genSpinner.warn('Claude says SKIP');
            return;
          }
          genSpinner.succeed(`Generated (${content.length} chars)`);

          // 7. Safety check
          const safetySpinner = ora('Safety check...').start();
          const safety = await runHotPotDetector({ content, claude, config });

          if (safety.verdict === 'REJECT') {
            safetySpinner.fail(chalk.red(`REJECTED: ${safety.reasons.join(', ')}`));
            posts.create({
              content,
              prompt_type: promptType,
              trend_topic: topic,
              safety_score: safety.score,
              safety_verdict: 'REJECT',
              status: 'rejected',
            });
            return;
          }

          if (safety.verdict === 'REVIEW') {
            safetySpinner.warn(chalk.yellow(`REVIEW NEEDED (score: ${safety.score})`));
            posts.create({
              content,
              prompt_type: promptType,
              trend_topic: topic,
              safety_score: safety.score,
              safety_verdict: 'REVIEW',
              status: 'review',
            });
            console.log(chalk.yellow('  Queued for human review'));
            return;
          }

          safetySpinner.succeed(chalk.green(`SAFE (score: ${safety.score})`));

          // 8. Post!
          const post = posts.create({
            content,
            prompt_type: promptType,
            trend_topic: topic,
            bill_slug: matchedBill?.slug,
            safety_score: safety.score,
            safety_verdict: 'SAFE',
            status: 'queued',
          });

          if (config.dryRun) {
            console.log(chalk.yellow('  [DRY RUN] Would post:'));
            console.log(chalk.dim(`  ${content}`));
          } else {
            const postSpinner = ora('Posting to X...').start();
            try {
              const result = await poster.postTweet(content);
              if (result.success) {
                posts.markPosted(post.id, 'browser');
                cooldowns.recordPost(topic);
                postSpinner.succeed(chalk.green('Posted via browser!'));
              } else {
                postSpinner.fail('Post failed');
                posts.markFailed(post.id, 'Browser posting failed');
              }
            } catch (err) {
              postSpinner.fail('Post failed');
              posts.markFailed(post.id, String(err));
            }
          }
        }
      };

      // Run immediately
      await runCycle();

      // Schedule recurring
      const cronExpr = `*/${opts.interval} * * * *`;
      schedule('auto-cycle', cronExpr, runCycle);

      // Cleanup cooldowns daily
      schedule('cooldown-cleanup', '0 0 * * *', async () => {
        cooldowns.cleanup();
      });

      console.log(chalk.dim(`\nNext cycle in ${opts.interval} minutes. Press Ctrl+C to stop.`));

      process.on('SIGINT', async () => {
        console.log(chalk.dim('\nShutting down YOLO mode...'));
        stopAll();
        await poster.close();
        process.exit(0);
      });

      await new Promise(() => {}); // Keep alive
    });
}
