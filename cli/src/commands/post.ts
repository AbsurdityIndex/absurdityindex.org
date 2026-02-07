import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { loadBill } from '../modules/bills/loader.js';
import { billUrl, cleanContent } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createGenerationModel } from '../modules/state/models/generations.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import { createCooldownManager } from '../modules/scheduler/cooldown.js';
import { calculateCostCents, modelDisplayName } from '../utils/pricing.js';
import { MemeService, type MemeAttachment } from '../modules/memes/meme-service.js';
import { generateCard, type CardResult } from '../modules/cards/card-generator.js';
import { postWithReply } from '../modules/posting/post-with-reply.js';
import type { PromptType } from '../modules/claude/prompts/index.js';

export function registerPostCommand(program: Command): void {
  const post = program.command('post').description('Generate and post to X');

  post
    .command('bill')
    .description('Post about a specific bill')
    .requiredOption('--slug <slug>', 'Bill slug')
    .option('--type <type>', 'Prompt type', 'bill-roast')
    .option('--meme', 'Generate and attach a meme or reaction GIF')
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
      const generations = createGenerationModel(db);
      const cooldowns = createCooldownManager(db);

      // Check cooldown
      if (!cooldowns.canPost(opts.slug)) {
        console.log(chalk.yellow(`Topic "${opts.slug}" is on cooldown. Use --force to override.`));
        return;
      }

      const siteUrl = billUrl(bill.slug, config.siteUrl);

      // Generate content (siteUrl still in context for research grounding, but NOT injected into tweet)
      const spinner = ora('Generating content...').start();
      const genResult = await claude.generate(opts.type as PromptType, {
        bill,
        siteUrl,
      });
      const content = cleanContent(genResult.content);
      spinner.succeed('Content generated');

      // Record generation cost
      generations.record({
        purpose: 'content',
        model: genResult.model,
        inputTokens: genResult.inputTokens,
        outputTokens: genResult.outputTokens,
        billSlug: opts.slug,
      });

      // Safety check
      const safetySpinner = ora('Running safety check...').start();
      const safety = await runHotPotDetector({ content, claude, config });

      if (safety.verdict === 'REJECT') {
        safetySpinner.fail(chalk.red(`REJECTED (score: ${safety.score})`));
        console.log(chalk.red('Reasons: ' + safety.reasons.join(', ')));

        posts.create({
          content,
          prompt_type: genResult.promptType,
          bill_slug: opts.slug,
          safety_score: safety.score,
          safety_verdict: 'REJECT',
          status: 'rejected',
        });
        return;
      }

      safetySpinner.succeed(`Safety: ${safety.verdict} (score: ${safety.score})`);

      const costCents = calculateCostCents(genResult.model, genResult.inputTokens, genResult.outputTokens);
      console.log(chalk.dim(`Cost: $${(costCents / 100).toFixed(4)} (${modelDisplayName(genResult.model)})`));

      // Display and confirm
      console.log('\n' + chalk.cyan('━'.repeat(50)));
      console.log(content);
      console.log(chalk.cyan('━'.repeat(50)));

      // Media: meme takes priority over card
      let memeAttachment: MemeAttachment | null = null;
      let cardResult: CardResult | null = null;

      if (opts.meme) {
        const memeSpinner = ora('Generating meme...').start();
        try {
          const memeService = new MemeService(config, claude);
          if (!memeService.isAvailable) {
            memeSpinner.warn('Meme APIs not configured — set IMGFLIP_USERNAME/PASSWORD or GIPHY_API_KEY');
          } else {
            const memeResult = await memeService.createMeme(content, `Bill: ${bill.title}`);

            // Record meme generation cost
            if (memeResult.model !== 'none') {
              generations.record({
                purpose: 'meme-strategy',
                model: memeResult.model,
                inputTokens: memeResult.inputTokens,
                outputTokens: memeResult.outputTokens,
                billSlug: opts.slug,
              });
            }

            memeAttachment = memeResult.attachment;
            if (memeAttachment) {
              memeSpinner.succeed(`Meme: ${memeResult.decision.strategy} — ${memeResult.decision.templateName ?? memeResult.decision.giphyQuery ?? ''}`);
              console.log(chalk.dim(`  Source: ${memeAttachment.sourceUrl}`));
            } else {
              memeSpinner.info(`Meme: ${memeResult.decision.reasoning ?? 'none selected'}`);
            }
          }
        } catch (err) {
          memeSpinner.warn('Meme generation failed — posting text-only');
          console.log(chalk.dim(`  Error: ${err instanceof Error ? err.message : String(err)}`));
        }
      }

      // Generate branded card if no meme
      if (!memeAttachment) {
        const cardSpinner = ora('Generating branded card...').start();
        try {
          cardResult = await generateCard({
            bill: {
              billNumber: bill.billNumber,
              title: bill.title,
              absurdityIndex: bill.absurdityIndex,
              totalPork: bill.totalPork,
            },
          });
          cardSpinner.succeed('Card generated');
        } catch (err) {
          cardSpinner.warn('Card generation failed — posting text-only');
          console.log(chalk.dim(`  Error: ${err instanceof Error ? err.message : String(err)}`));
        }
      }

      const mediaPath = memeAttachment?.filePath ?? cardResult?.filePath;

      // Save post
      const post = posts.create({
        content,
        prompt_type: genResult.promptType,
        bill_slug: opts.slug,
        safety_score: safety.score,
        safety_verdict: safety.verdict,
        status: config.dryRun ? 'draft' : 'queued',
        media_url: memeAttachment?.sourceUrl,
        media_type: memeAttachment?.mimeType ?? (cardResult ? 'image/png' : undefined),
        meme_strategy: memeAttachment?.strategy,
        meme_template: memeAttachment?.templateName,
      });

      // Link generation cost to post
      generations.record({
        postId: post.id,
        purpose: 'content',
        model: genResult.model,
        inputTokens: genResult.inputTokens,
        outputTokens: genResult.outputTokens,
        billSlug: opts.slug,
      });

      if (config.dryRun) {
        console.log(chalk.yellow('[DRY RUN] Would post this tweet'));
        if (mediaPath) console.log(chalk.dim(`  Media: ${mediaPath}`));
        console.log(chalk.dim(`  Reply CTA would link to: ${siteUrl}`));
        memeAttachment?.cleanup();
        cardResult?.cleanup();
        return;
      }

      // Post to X with CTA reply
      const postSpinner = ora('Posting to X...').start();
      try {
        const result = await postWithReply({
          content,
          config,
          mediaPath,
          siteUrl,
          billSlug: opts.slug,
        });
        if (result.success) {
          posts.markPosted(post.id, result.tweetId ?? result.method, result.replyTweetId);
          cooldowns.recordPost(opts.slug);
          postSpinner.succeed(`Posted via ${result.method}!`);
          if (result.tweetUrl) console.log(chalk.dim(`  ${result.tweetUrl}`));
          if (result.replyTweetId) console.log(chalk.dim(`  CTA reply posted`));
        } else {
          postSpinner.fail('Failed to post');
          posts.markFailed(post.id, 'Posting failed');
        }
      } catch (err) {
        postSpinner.fail('Failed to post');
        posts.markFailed(post.id, String(err));
        console.error(err);
      } finally {
        memeAttachment?.cleanup();
        cardResult?.cleanup();
      }
    });

  post
    .command('trend')
    .description('Post about a trending topic')
    .requiredOption('--topic <topic>', 'Trending topic')
    .option('--type <type>', 'Prompt type', 'trend-jack')
    .option('--meme', 'Generate and attach a meme or reaction GIF')
    .option('--dry-run', 'Generate but don\'t post')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const claude = new ClaudeClient(config);

      const spinner = ora('Generating content...').start();
      const genResult = await claude.generate(opts.type as PromptType, {
        trendTopic: opts.topic,
      });
      const content = cleanContent(genResult.content);

      if (content === 'SKIP') {
        spinner.warn('Claude says SKIP — no good angle on this trend');
        return;
      }

      spinner.succeed('Content generated');
      console.log('\n' + content);

      if (!config.dryRun) {
        const db = getDb(config.dbPath);
        const posts = createPostModel(db);
        const generations = createGenerationModel(db);

        const safety = await runHotPotDetector({ content, claude, config });
        if (safety.verdict === 'REJECT') {
          console.log(chalk.red(`Safety REJECTED: ${safety.reasons.join(', ')}`));
          return;
        }

        // Media: meme takes priority over card
        let memeAttachment: MemeAttachment | null = null;
        let cardResult: CardResult | null = null;

        if (opts.meme) {
          const memeSpinner = ora('Generating meme...').start();
          try {
            const memeService = new MemeService(config, claude);
            if (!memeService.isAvailable) {
              memeSpinner.warn('Meme APIs not configured');
            } else {
              const memeResult = await memeService.createMeme(content, `Trend: ${opts.topic}`);

              if (memeResult.model !== 'none') {
                generations.record({
                  purpose: 'meme-strategy',
                  model: memeResult.model,
                  inputTokens: memeResult.inputTokens,
                  outputTokens: memeResult.outputTokens,
                });
              }

              memeAttachment = memeResult.attachment;
              if (memeAttachment) {
                memeSpinner.succeed(`Meme: ${memeResult.decision.strategy} — ${memeResult.decision.templateName ?? memeResult.decision.giphyQuery ?? ''}`);
              } else {
                memeSpinner.info(`Meme: ${memeResult.decision.reasoning ?? 'none selected'}`);
              }
            }
          } catch {
            memeSpinner.warn('Meme generation failed — posting text-only');
          }
        }

        // Generate branded card if no meme
        if (!memeAttachment) {
          const cardSpinner = ora('Generating branded card...').start();
          try {
            cardResult = await generateCard({ headline: opts.topic });
            cardSpinner.succeed('Card generated');
          } catch {
            cardSpinner.warn('Card generation failed — posting text-only');
          }
        }

        const mediaPath = memeAttachment?.filePath ?? cardResult?.filePath;

        const post = posts.create({
          content,
          prompt_type: genResult.promptType,
          trend_topic: opts.topic,
          safety_score: safety.score,
          safety_verdict: safety.verdict,
          status: 'queued',
          media_url: memeAttachment?.sourceUrl,
          media_type: memeAttachment?.mimeType ?? (cardResult ? 'image/png' : undefined),
          meme_strategy: memeAttachment?.strategy,
          meme_template: memeAttachment?.templateName,
        });

        try {
          const postResult = await postWithReply({
            content,
            config,
            mediaPath,
            siteUrl: config.siteUrl,
          });
          if (postResult.success) {
            posts.markPosted(post.id, postResult.tweetId ?? postResult.method, postResult.replyTweetId);
            console.log(chalk.green(`Posted via ${postResult.method}!`));
            if (postResult.tweetUrl) console.log(chalk.dim(`  ${postResult.tweetUrl}`));
            if (postResult.replyTweetId) console.log(chalk.dim(`  CTA reply posted`));
          }
        } finally {
          memeAttachment?.cleanup();
          cardResult?.cleanup();
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

      // Check for saved meme file from draft generation
      let mediaPath: string | undefined;
      if (post.meme_strategy) {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const ext = post.media_type === 'image/gif' ? 'gif' : 'jpg';
        const savedPath = path.join(config.dataDir, 'memes', `post-${post.id}.${ext}`);
        if (fs.existsSync(savedPath)) {
          mediaPath = savedPath;
          console.log(chalk.dim(`Meme: ${post.meme_strategy} — ${post.meme_template ?? ''} (${savedPath})`));
        }
      }

      if (config.dryRun) {
        console.log(chalk.yellow('[DRY RUN]'));
        return;
      }

      const siteUrl = post.bill_slug ? billUrl(post.bill_slug, config.siteUrl) : undefined;

      const result = await postWithReply({
        content: post.content,
        config,
        mediaPath,
        siteUrl,
        billSlug: post.bill_slug ?? undefined,
      });
      if (result.success) {
        posts.markPosted(post.id, result.tweetId ?? result.method, result.replyTweetId);
        console.log(chalk.green(`Posted via ${result.method}!`));
        if (result.tweetUrl) console.log(chalk.dim(`  ${result.tweetUrl}`));
        if (result.replyTweetId) console.log(chalk.dim(`  CTA reply posted`));
      }
    });
}
