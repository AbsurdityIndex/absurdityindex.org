import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { renderMemePng, type MemeTemplate } from '../modules/memes/local-meme-renderer.js';

function ensurePngFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'meme.png';
  return trimmed.toLowerCase().endsWith('.png') ? trimmed : `${trimmed}.png`;
}

function parsePositiveInt(value: string, label: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive integer (got: ${value})`);
  }
  return n;
}

function normalizeText(text: string): string {
  // Support "\n" sequences from shell args.
  return text.replace(/\\n/g, '\n');
}

function isTemplate(value: string): value is MemeTemplate {
  return value === 'committee-memo' || value === 'navy-card';
}

export function registerMemeCommand(program: Command): void {
  program
    .command('meme')
    .description('Render a site-branded meme image (PNG) using HTML/CSS + headless Playwright')
    .argument('[text...]', 'Meme text (wrap in quotes for spaces)')
    .option('--text <text>', 'Meme text (alternative to positional argument)')
    .option('--text-file <path>', 'Read meme text from a file')
    .option('--out-dir <dir>', 'Output directory', '.')
    .requiredOption('--filename <name>', 'Output filename (png)')
    .option('--width <px>', 'Image width in pixels', String(1200))
    .option('--height <px>', 'Image height in pixels', String(630))
    .option('--template <name>', 'Template: committee-memo | navy-card', 'committee-memo')
    .option('--stamp-text <text>', 'Stamp overlay text', 'UNDER CONSIDERATION')
    .option('--no-stamp', 'Disable stamp overlay')
    .option('--headed', 'Run with a visible browser window (debug)', false)
    .action(async (textParts: string[], opts) => {
      const config = loadConfig();
      createLogger(config.logLevel);

      const spinner = ora('Rendering meme...').start();

      try {
        const fromArg = textParts?.length ? textParts.join(' ').trim() : '';
        const fromOpt = typeof opts.text === 'string' ? String(opts.text).trim() : '';
        const fromFile = typeof opts.textFile === 'string' ? String(opts.textFile).trim() : '';

        const sources = [fromArg ? 'arg' : null, fromOpt ? 'opt' : null, fromFile ? 'file' : null].filter(Boolean);
        if (sources.length === 0) {
          throw new Error('Missing meme text. Pass positional text or --text or --text-file.');
        }
        if (sources.length > 1) {
          throw new Error('Provide meme text using only one source: positional text OR --text OR --text-file.');
        }

        let text = fromArg || fromOpt;
        if (fromFile) {
          text = fs.readFileSync(path.resolve(process.cwd(), fromFile), 'utf-8').trimEnd();
        }
        text = normalizeText(text);

        const outDirAbs = path.resolve(process.cwd(), String(opts.outDir ?? '.'));
        const filename = ensurePngFilename(String(opts.filename));
        const outPath = path.join(outDirAbs, filename);

        const width = parsePositiveInt(String(opts.width), 'width');
        const height = parsePositiveInt(String(opts.height), 'height');

        const templateRaw = String(opts.template ?? 'committee-memo');
        if (!isTemplate(templateRaw)) {
          throw new Error(`Unknown template: ${templateRaw}. Use committee-memo or navy-card.`);
        }

        fs.mkdirSync(path.dirname(outPath), { recursive: true });

        spinner.text = 'Launching browser...';
        await renderMemePng({
          text,
          outPath,
          width,
          height,
          template: templateRaw,
          stampText: opts.stamp ? String(opts.stampText ?? 'UNDER CONSIDERATION') : null,
          headless: !opts.headed,
        });

        spinner.succeed('Meme saved');
        console.log(chalk.dim(`  Template: ${templateRaw} | Size: ${width}x${height}`));
        console.log(chalk.green(`  PNG: ${outPath}`));
      } catch (err) {
        spinner.fail('Meme render failed');
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  Error: ${msg}`));
        process.exitCode = 1;
      }
    });
}

