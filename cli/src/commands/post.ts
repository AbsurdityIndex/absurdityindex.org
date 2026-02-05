import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { BrowserPoster } from '../modules/x-api/browser-poster.js';
import { loadBill } from '../modules/bills/loader.js';
import { formatTweet, formatThread, billUrl, cleanContent } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import { createCooldownManager } from '../modules/scheduler/cooldown.js';
import type { PromptType, PromptContext } from '../modules/claude/prompts/index.js';

export function registerPostCommand(program: Command): void {
  const post = program.command('post').description('Generate and post to X');

  post
    .command('bill')
    .description('Post about a specific bill')
    .requiredOption('--slug <slug>', 'Bill slug')
    .option('--type <type>', 'Prompt type', 'bill-roast')
    .option('--dry-run', 'Generate but don\'t post')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);

      const bill = loadBill(config.billsDir, opts.slug);
      if (!bill) {
        console.log(chalk.red(`Bill not found: ${opts.slug}`));
        return;
      }

      const claude = new ClaudeClient(config);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const cooldowns = createCooldownManager(db);

      // Check cooldown
      if (!cooldowns.canPost(opts.slug)) {
        console.log(chalk.yellow(`Topic "${opts.slug}" is on cooldown. Use --force to override.`));
        return;
      }

      // Generate content
      const spinner = ora('Generating content...').start();
      const result = await claude.generate(opts.type as PromptType, {
        bill,
        siteUrl: billUrl(bill.slug, config.siteUrl),
      });
      const content = cleanContent(result.content);
      spinner.succeed('Content generated');

      // Safety check
      const safetySpinner = ora('Running safety check...').start();
      const safety = await runHotPotDetector({ content, claude, config });

      if (safety.verdict === 'REJECT') {
        safetySpinner.fail(chalk.red(`REJECTED (score: ${safety.score})`));
        console.log(chalk.red('Reasons: ' + safety.reasons.join(', ')));

        posts.create({
          content,
          prompt_type: result.promptType,
          bill_slug: opts.slug,
          safety_score: safety.score,
          safety_verdict: 'REJECT',
          status: 'rejected',
        });
        return;
      }

      safetySpinner.succeed(`Safety: ${safety.verdict} (score: ${safety.score})`);

      // Display and confirm
      console.log('\n' + chalk.cyan('━'.repeat(50)));
      console.log(content);
      console.log(chalk.cyan('━'.repeat(50)));

      // Save post
      const post = posts.create({
        content,
        prompt_type: result.promptType,
        bill_slug: opts.slug,
        safety_score: safety.score,
        safety_verdict: safety.verdict,
        status: config.dryRun ? 'draft' : 'queued',
      });

      if (config.dryRun) {
        console.log(chalk.yellow('[DRY RUN] Would post this tweet'));
        return;
      }

      // Post to X via browser
      const postSpinner = ora('Posting to X...').start();
      const poster = new BrowserPoster(config);
      try {
        const result = await poster.postTweet(content);
        if (result.success) {
          posts.markPosted(post.id, 'browser');
          cooldowns.recordPost(opts.slug);
          postSpinner.succeed('Posted via browser!');
        } else {
          postSpinner.fail('Failed to post');
          posts.markFailed(post.id, 'Browser posting failed');
        }
      } catch (err) {
        postSpinner.fail('Failed to post');
        posts.markFailed(post.id, String(err));
        console.error(err);
      } finally {
        await poster.close();
      }
    });

  post
    .command('trend')
    .description('Post about a trending topic')
    .requiredOption('--topic <topic>', 'Trending topic')
    .option('--type <type>', 'Prompt type', 'trend-jack')
    .option('--dry-run', 'Generate but don\'t post')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const claude = new ClaudeClient(config);

      const spinner = ora('Generating content...').start();
      const result = await claude.generate(opts.type as PromptType, {
        trendTopic: opts.topic,
      });
      const content = cleanContent(result.content);

      if (content === 'SKIP') {
        spinner.warn('Claude says SKIP — no good angle on this trend');
        return;
      }

      spinner.succeed('Content generated');
      console.log('\n' + content);

      if (!config.dryRun) {
        const db = getDb(config.dbPath);
        const posts = createPostModel(db);

        const safety = await runHotPotDetector({ content, claude, config });
        if (safety.verdict === 'REJECT') {
          console.log(chalk.red(`Safety REJECTED: ${safety.reasons.join(', ')}`));
          return;
        }

        const post = posts.create({
          content,
          prompt_type: result.promptType,
          trend_topic: opts.topic,
          safety_score: safety.score,
          safety_verdict: safety.verdict,
          status: 'queued',
        });

        const poster = new BrowserPoster(config);
        try {
          const result = await poster.postTweet(content);
          if (result.success) {
            posts.markPosted(post.id, 'browser');
            console.log(chalk.green('Posted via browser!'));
          }
        } finally {
          await poster.close();
        }
      }
    });

  post
    .command('draft-id')
    .description('Post an existing draft')
    .requiredOption('--id <id>', 'Draft post ID')
    .option('--dry-run', 'Simulate posting')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);

      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const post = posts.getById(parseInt(opts.id, 10));

      if (!post) {
        console.log(chalk.red(`Post #${opts.id} not found`));
        return;
      }

      console.log(chalk.bold('Posting draft:'));
      console.log(post.content);

      if (config.dryRun) {
        console.log(chalk.yellow('[DRY RUN]'));
        return;
      }

      const poster = new BrowserPoster(config);
      try {
        const result = await poster.postTweet(post.content);
        if (result.success) {
          posts.markPosted(post.id, 'browser');
          console.log(chalk.green('Posted via browser!'));
        }
      } finally {
        await poster.close();
      }
    });
}
