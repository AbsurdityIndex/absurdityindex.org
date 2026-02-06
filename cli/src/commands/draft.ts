import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { loadBill, loadBills } from '../modules/bills/loader.js';
import { formatTweet, formatThread, billUrl, cleanContent } from '../utils/format.js';
import { getDb } from '../modules/state/db.js';
import { createPostModel } from '../modules/state/models/posts.js';
import { createGenerationModel } from '../modules/state/models/generations.js';
import { createBatchModel } from '../modules/state/models/batches.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import { findOverlapCandidates, analyzeOverlap, buildOverlapContext } from '../modules/bills/overlap.js';
import { BatchClient } from '../modules/claude/batch.js';
import { getPrompt } from '../modules/claude/prompts/index.js';
import { calculateCostCents, modelDisplayName } from '../utils/pricing.js';
import { MemeService } from '../modules/memes/meme-service.js';
import type { PromptType, PromptContext } from '../modules/claude/prompts/index.js';

export function registerDraftCommand(program: Command): void {
  const draft = program.command('draft').description('Generate draft posts without posting');

  draft
    .command('bill')
    .description('Draft a post about a specific bill')
    .requiredOption('--slug <slug>', 'Bill slug (e.g., real-hr-25)')
    .option('--type <type>', 'Prompt type (bill-roast, pork-barrel-report, cspan-after-dark)', 'bill-roast')
    .option('--meme', 'Generate and save a meme for later posting')
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
        const db = getDb(config.dbPath);
        const generations = createGenerationModel(db);
        const allBills = loadBills(config.billsDir);

        // Overlap detection (Tier 1)
        spinner.text = 'Checking legislative overlap...';
        const candidates = findOverlapCandidates(bill, allBills);
        let overlapContext: string | undefined;

        if (candidates.length > 0) {
          spinner.text = `Found ${candidates.length} overlap candidates — analyzing...`;
          const overlapResult = await analyzeOverlap(bill, candidates, claude, db);

          // Record overlap API costs
          for (const call of overlapResult.apiCalls) {
            generations.record({
              purpose: 'overlap',
              model: call.model,
              inputTokens: call.inputTokens,
              outputTokens: call.outputTokens,
              billSlug: opts.slug,
            });
          }

          overlapContext = buildOverlapContext(overlapResult.analyses);

          if (overlapResult.analyses.length > 0) {
            console.log(chalk.yellow('\n  Overlap detected:'));
            for (const a of overlapResult.analyses) {
              console.log(chalk.dim(`  ${a.similarityPct}% — ${a.candidateBillNumber} (${a.relationship})`));
            }
          }
        }

        // Generate content
        spinner.text = 'Generating content...';
        const context: PromptContext = {
          bill,
          siteUrl: billUrl(bill.slug, config.siteUrl),
          overlapContext,
        };

        const result = await claude.generate(opts.type as PromptType, context);
        const content = cleanContent(result.content);

        spinner.succeed('Draft generated');
        console.log('\n' + chalk.cyan('━'.repeat(50)));
        console.log(chalk.bold('Draft:'));
        console.log(content);
        console.log(chalk.cyan('━'.repeat(50)));
        console.log(chalk.dim(`Type: ${result.promptType} | Tokens: ${result.tokensUsed} | Length: ${content.length}/280`));

        // Record generation cost
        generations.record({
          purpose: 'content',
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          billSlug: opts.slug,
        });

        // Run safety check
        const safetySpinner = ora('Running safety check...').start();
        const safety = await runHotPotDetector({ content, claude, config });
        const verdictColor = safety.verdict === 'SAFE' ? chalk.green : safety.verdict === 'REVIEW' ? chalk.yellow : chalk.red;
        safetySpinner.succeed(`Safety: ${verdictColor(safety.verdict)} (score: ${safety.score})`);

        if (safety.reasons.length > 0) {
          console.log(chalk.dim('Reasons: ' + safety.reasons.join(', ')));
        }

        // Meme generation (non-fatal)
        let memeMediaUrl: string | undefined;
        let memeMediaType: string | undefined;
        let memeStrategy: string | undefined;
        let memeTemplate: string | undefined;
        let memeTempPath: string | undefined;

        if (opts.meme) {
          const memeSpinner = ora('Generating meme...').start();
          try {
            const memeService = new MemeService(config, claude);
            if (!memeService.isAvailable) {
              memeSpinner.warn('Meme APIs not configured — set IMGFLIP_USERNAME/PASSWORD or GIPHY_API_KEY');
            } else {
              const memeResult = await memeService.createMeme(content, `Bill: ${bill.title}`);

              if (memeResult.model !== 'none') {
                generations.record({
                  purpose: 'meme-strategy',
                  model: memeResult.model,
                  inputTokens: memeResult.inputTokens,
                  outputTokens: memeResult.outputTokens,
                  billSlug: opts.slug,
                });
              }

              if (memeResult.attachment) {
                memeMediaUrl = memeResult.attachment.sourceUrl;
                memeMediaType = memeResult.attachment.mimeType;
                memeStrategy = memeResult.attachment.strategy;
                memeTemplate = memeResult.attachment.templateName;
                memeTempPath = memeResult.attachment.filePath;
                memeSpinner.succeed(`Meme: ${memeResult.decision.strategy} — ${memeResult.decision.templateName ?? memeResult.decision.giphyQuery ?? ''}`);
                console.log(chalk.dim(`  Source: ${memeResult.attachment.sourceUrl}`));
              } else {
                memeSpinner.info(`Meme: ${memeResult.decision.reasoning ?? 'none selected'}`);
              }
            }
          } catch (err) {
            memeSpinner.warn('Meme generation failed');
            console.log(chalk.dim(`  Error: ${err instanceof Error ? err.message : String(err)}`));
          }
        }

        if (!opts.dryRun) {
          const posts = createPostModel(db);
          const post = posts.create({
            content,
            prompt_type: result.promptType,
            bill_slug: opts.slug,
            safety_score: safety.score,
            safety_verdict: safety.verdict,
            status: 'draft',
            media_url: memeMediaUrl,
            media_type: memeMediaType,
            meme_strategy: memeStrategy,
            meme_template: memeTemplate,
          });

          // Save meme file for later use when posting the draft
          if (memeTempPath && memeStrategy) {
            const memesDir = path.join(config.dataDir, 'memes');
            fs.mkdirSync(memesDir, { recursive: true });
            const ext = memeMediaType === 'image/gif' ? 'gif' : 'jpg';
            const savedPath = path.join(memesDir, `post-${post.id}.${ext}`);
            fs.copyFileSync(memeTempPath, savedPath);
            console.log(chalk.dim(`  Meme saved: ${savedPath}`));
          }

          // Cleanup temp file
          if (memeTempPath) {
            try { fs.unlinkSync(memeTempPath); } catch { /* ok */ }
          }

          // Record safety costs (link to post)
          // Safety uses 2 Claude calls (partisan + toxicity), recorded as 'safety' purpose
          generations.record({
            postId: post.id,
            purpose: 'safety',
            model: result.model,
            inputTokens: 0,
            outputTokens: 0,
            billSlug: opts.slug,
          });

          // Re-record generation cost linked to post
          generations.record({
            postId: post.id,
            purpose: 'content',
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            billSlug: opts.slug,
          });

          console.log(chalk.dim(`Saved as draft #${post.id}`));
        } else if (memeTempPath) {
          // Cleanup temp file in dry-run mode
          try { fs.unlinkSync(memeTempPath); } catch { /* ok */ }
        }

        // Display cost summary
        const costCents = calculateCostCents(result.model, result.inputTokens, result.outputTokens);
        console.log(chalk.dim(`Cost: $${(costCents / 100).toFixed(4)} (${modelDisplayName(result.model)})`));
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
    .option('--api <mode>', 'API mode: sequential (default) or batch', 'sequential')
    .option('--poll-interval <sec>', 'Batch poll interval in seconds', '90')
    .option('--resume <batchId>', 'Resume polling an existing batch')
    .action(async (opts) => {
      const config = loadConfig({ dryRun: opts.dryRun });
      createLogger(config.logLevel);
      const count = parseInt(opts.count, 10);
      const apiMode = opts.api as string;

      const bills = loadBills(config.billsDir);
      const claude = new ClaudeClient(config);
      const db = getDb(config.dbPath);
      const posts = createPostModel(db);
      const generations = createGenerationModel(db);
      const promptTypes: PromptType[] = ['bill-roast', 'cspan-after-dark', 'pork-barrel-report'];

      // Pick random bills with high absurdity
      const sortedBills = bills
        .filter(b => b.absurdityIndex && b.absurdityIndex >= 5)
        .sort(() => Math.random() - 0.5)
        .slice(0, count);

      const actualCount = Math.min(count, sortedBills.length);

      if (apiMode === 'batch') {
        // ── Batch API mode ──
        await runBatchMode({
          config, bills, sortedBills, actualCount, promptTypes, opts,
          claude, db, posts, generations,
        });
      } else {
        // ── Sequential mode (original behavior + overlap + cost tracking) ──
        console.log(chalk.bold(`Generating ${count} drafts (sequential)...`));

        let totalCostCents = 0;

        for (let i = 0; i < actualCount; i++) {
          const bill = sortedBills[i]!;
          const promptType = opts.type as PromptType ?? promptTypes[i % promptTypes.length]!;
          const spinner = ora(`[${i + 1}/${actualCount}] ${bill.billNumber}...`).start();

          try {
            // Tier 1 overlap (cheap, no API)
            const candidates = findOverlapCandidates(bill, bills);
            let overlapContext: string | undefined;

            if (candidates.length > 0) {
              const overlapResult = await analyzeOverlap(bill, candidates, claude, db);
              overlapContext = buildOverlapContext(overlapResult.analyses);

              for (const call of overlapResult.apiCalls) {
                generations.record({
                  purpose: 'overlap',
                  model: call.model,
                  inputTokens: call.inputTokens,
                  outputTokens: call.outputTokens,
                  billSlug: bill.slug,
                });
              }
            }

            const result = await claude.generate(promptType, {
              bill,
              siteUrl: billUrl(bill.slug, config.siteUrl),
              overlapContext,
            });
            const content = cleanContent(result.content);

            // Record generation cost
            generations.record({
              purpose: 'content',
              model: result.model,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              billSlug: bill.slug,
            });

            const costCents = calculateCostCents(result.model, result.inputTokens, result.outputTokens);
            totalCostCents += costCents;

            const safety = await runHotPotDetector({ content, claude, config });
            const verdictColor = safety.verdict === 'SAFE' ? chalk.green : safety.verdict === 'REVIEW' ? chalk.yellow : chalk.red;

            spinner.succeed(`${bill.billNumber} → ${verdictColor(safety.verdict)} (${content.length} chars, $${(costCents / 100).toFixed(4)})`);
            console.log(chalk.dim(`  ${content.slice(0, 100)}...`));
            if (overlapContext) {
              console.log(chalk.yellow(`  ↳ overlap context injected`));
            }

            if (!opts.dryRun) {
              const post = posts.create({
                content,
                prompt_type: promptType,
                bill_slug: bill.slug,
                safety_score: safety.score,
                safety_verdict: safety.verdict,
                status: 'draft',
              });

              generations.record({
                postId: post.id,
                purpose: 'content',
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                billSlug: bill.slug,
              });
            }
          } catch (err) {
            spinner.fail(`${bill.billNumber} failed`);
          }
        }

        console.log(chalk.bold(`\nDone. Generated ${actualCount} drafts.`));
        console.log(chalk.dim(`Total cost: $${(totalCostCents / 100).toFixed(4)}`));
      }
    });
}

// ── Batch API flow ──

interface BatchModeOpts {
  config: ReturnType<typeof loadConfig>;
  bills: ReturnType<typeof loadBills>;
  sortedBills: ReturnType<typeof loadBills>;
  actualCount: number;
  promptTypes: PromptType[];
  opts: any;
  claude: ClaudeClient;
  db: ReturnType<typeof getDb>;
  posts: ReturnType<typeof createPostModel>;
  generations: ReturnType<typeof createGenerationModel>;
}

async function runBatchMode(args: BatchModeOpts): Promise<void> {
  const { config, bills, sortedBills, actualCount, promptTypes, opts, claude, db, posts, generations } = args;
  const batchClient = new BatchClient(config);
  const batchesModel = createBatchModel(db);
  const pollInterval = parseInt(opts.pollInterval ?? '90', 10) * 1000;

  let batchId: string;

  if (opts.resume) {
    // Resume an existing batch
    batchId = opts.resume as string;
    console.log(chalk.bold(`Resuming batch ${batchId}...`));
  } else {
    // Build batch requests
    console.log(chalk.bold(`Generating ${actualCount} drafts (batch API — 50% cheaper)...`));

    const batchRequests: Array<{
      customId: string;
      model: string;
      maxTokens: number;
      system: string;
      userMessage: string;
    }> = [];

    for (let i = 0; i < actualCount; i++) {
      const bill = sortedBills[i]!;
      const promptType = opts.type as PromptType ?? promptTypes[i % promptTypes.length]!;

      // Tier 1 overlap (cheap, no API)
      const candidates = findOverlapCandidates(bill, bills);
      let overlapContext: string | undefined;
      if (candidates.length > 0) {
        const overlapResult = await analyzeOverlap(bill, candidates, claude, db);
        overlapContext = buildOverlapContext(overlapResult.analyses);

        for (const call of overlapResult.apiCalls) {
          generations.record({
            purpose: 'overlap',
            model: call.model,
            inputTokens: call.inputTokens,
            outputTokens: call.outputTokens,
            billSlug: bill.slug,
          });
        }
      }

      const context: PromptContext = {
        bill,
        siteUrl: billUrl(bill.slug, config.siteUrl),
        overlapContext,
      };

      const { system, user } = getPrompt(promptType, context);

      batchRequests.push({
        customId: `${bill.slug}::${promptType}`,
        model: 'claude-opus-4-6',
        maxTokens: 1024,
        system,
        userMessage: user,
      });

      console.log(chalk.dim(`  Prepared: ${bill.billNumber} (${promptType})${overlapContext ? ' +overlap' : ''}`));
    }

    // Submit batch
    const submitSpinner = ora('Submitting batch...').start();
    batchId = await batchClient.submit(batchRequests);
    submitSpinner.succeed(`Batch submitted: ${chalk.cyan(batchId)}`);

    // Track in DB
    batchesModel.create(
      batchId,
      batchRequests.length,
      JSON.stringify(batchRequests.map(r => ({ customId: r.customId }))),
    );
  }

  // Poll for completion
  const pollSpinner = ora('Waiting for batch to complete...').start();
  const finalProgress = await batchClient.poll(batchId, pollInterval, (progress) => {
    pollSpinner.text = `Batch ${batchId}: ${progress.succeeded}/${progress.requestCount} done, ${progress.errored} errors`;
  });
  pollSpinner.succeed(`Batch complete: ${finalProgress.succeeded} succeeded, ${finalProgress.errored} errors`);

  // Fetch results
  const resultsSpinner = ora('Fetching batch results...').start();
  const results = await batchClient.fetchResults(batchId);
  resultsSpinner.succeed(`Fetched ${results.length} results`);

  // Process each result: safety check (sequential) + save
  let totalCostCents = 0;
  let standardCostCents = 0;

  for (const item of results) {
    if (item.error) {
      console.log(chalk.red(`  ✗ ${item.customId}: ${item.error}`));
      continue;
    }

    const content = cleanContent(item.content);
    const [billSlug, promptType] = item.customId.split('::') as [string, PromptType];

    // Record batch generation cost
    const batchCost = calculateCostCents(item.model, item.inputTokens, item.outputTokens, true);
    const standardCost = calculateCostCents(item.model, item.inputTokens, item.outputTokens, false);
    totalCostCents += batchCost;
    standardCostCents += standardCost;

    generations.record({
      purpose: 'batch-content',
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      isBatch: true,
      batchId,
      billSlug,
    });

    // Safety check (sequential, uses standard Sonnet pricing)
    const safety = await runHotPotDetector({ content, claude, config });
    const verdictColor = safety.verdict === 'SAFE' ? chalk.green : safety.verdict === 'REVIEW' ? chalk.yellow : chalk.red;

    console.log(`  ${verdictColor(safety.verdict)} ${billSlug} [${promptType}] (${content.length} chars, $${(batchCost / 100).toFixed(4)})`);
    console.log(chalk.dim(`    ${content.slice(0, 100)}...`));

    if (!opts.dryRun) {
      const post = posts.create({
        content,
        prompt_type: promptType,
        bill_slug: billSlug,
        safety_score: safety.score,
        safety_verdict: safety.verdict,
        status: 'draft',
      });

      generations.record({
        postId: post.id,
        purpose: 'batch-content',
        model: item.model,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        isBatch: true,
        batchId,
        billSlug,
      });
    }
  }

  // Mark batch complete
  batchesModel.markCompleted(batchId);

  // Summary
  const savedCents = standardCostCents - totalCostCents;
  console.log(chalk.bold('\n  Batch Summary'));
  console.log(chalk.dim('  ─'.repeat(25)));
  console.log(`  Results:     ${chalk.cyan(String(results.length))}`);
  console.log(`  Batch cost:  ${chalk.green(`$${(totalCostCents / 100).toFixed(4)}`)}`);
  console.log(`  Standard:    ${chalk.dim(`$${(standardCostCents / 100).toFixed(4)}`)}`);
  console.log(`  Saved:       ${chalk.green(`$${(savedCents / 100).toFixed(4)} (50%)`)}`);
}
