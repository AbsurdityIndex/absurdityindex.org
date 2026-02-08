import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { ClaudeClient } from '../modules/claude/client.js';
import { runHotPotDetector } from '../modules/safety/hot-pot-detector.js';
import { checkBlocklist } from '../modules/safety/blocklist.js';
import { checkContentFilter } from '../modules/safety/content-filter.js';

export function registerTestSafetyCommand(program: Command): void {
  program
    .command('test-safety')
    .description('Test the Hot Pot Detector safety scoring on text')
    .argument('<text>', 'Text to test')
    .option('--verbose', 'Show detailed layer breakdown')
    .option('--skip-claude', 'Skip Claude-powered checks (faster)')
    .action(async (text: string, opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);

      console.log(chalk.bold('\nHot Pot Detector'));
      console.log(chalk.dim('━'.repeat(50)));
      console.log(`Testing: "${text}"`);
      console.log(chalk.dim('━'.repeat(50)));

      // Layer 1: Blocklist (always fast)
      const blockResult = checkBlocklist(text, config.dataDir);
      if (blockResult.blocked) {
        console.log(chalk.red.bold('\nINSTANT REJECT'));
        console.log(chalk.red(`Blocklist match: ${blockResult.matchedTerm} (${blockResult.reason})`));
        return;
      }
      console.log(chalk.green('OK Blocklist: Clear'));

      // Layer 5: Content filter (fast, rule-based)
      const filterResult = checkContentFilter(text);
      console.log(
        filterResult.score === 0
          ? chalk.green('OK Content filter: Clean')
          : chalk.yellow(`WARN Content filter: ${filterResult.score}/20 - ${filterResult.issues.join(', ')}`)
      );

      if (opts.skipClaude) {
        console.log(chalk.dim('\n[Skipping Claude-powered checks]'));
        const score = filterResult.score;
        const verdict = score > config.safetyReviewThreshold ? 'REJECT' : score >= config.safetyAutoPostThreshold ? 'REVIEW' : 'SAFE';
        printVerdict(verdict, score);
        return;
      }

      // Full check with Claude
      const spinner = ora('Running full safety analysis...').start();
      try {
        const claude = new ClaudeClient(config);
        const result = await runHotPotDetector({ content: text, claude, config });
        spinner.stop();

        if (opts.verbose) {
          console.log(chalk.bold('\nLayer Scores:'));
          console.log(`  Blocklist:       ${result.layers.blocklist}/∞`);
          console.log(`  Tragedy Radar:   ${result.layers.tragedyRadar}/30`);
          console.log(`  Partisan Lean:   ${result.layers.partisanLean}/25${result.partisanLean !== undefined ? ` (lean: ${result.partisanLean > 0 ? '+' : ''}${result.partisanLean.toFixed(2)})` : ''}`);
          console.log(`  Toxicity:        ${result.layers.toxicity}/25`);
          console.log(`  Content Quality: ${result.layers.contentQuality}/20`);
        }

        if (result.reasons.length > 0) {
          console.log(chalk.dim('\nFlags:'));
          for (const reason of result.reasons) {
            console.log(chalk.dim(`  • ${reason}`));
          }
        }

        printVerdict(result.verdict, result.score);
      } catch (err) {
        spinner.fail('Safety check failed');
        console.error(err);
      }
    });
}

function printVerdict(verdict: string, score: number): void {
  console.log(chalk.bold('\nVerdict:'));
  switch (verdict) {
    case 'SAFE':
      console.log(chalk.green.bold(`  SAFE (score: ${score}) - Auto-post in YOLO mode`));
      break;
    case 'REVIEW':
      console.log(chalk.yellow.bold(`  REVIEW (score: ${score}) - Queued for human review`));
      break;
    case 'REJECT':
      console.log(chalk.red.bold(`  REJECT (score: ${score}) - Content discarded`));
      break;
  }
}
