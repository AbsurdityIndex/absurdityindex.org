import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { BrowserPoster } from '../modules/x-api/browser-poster.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with X via browser (saves session for posting)')
    .action(async () => {
      const config = loadConfig();
      createLogger(config.logLevel);

      console.log(chalk.bold('\nX Browser Authentication'));
      console.log(chalk.dim('A browser window will open. Log in to your X account.\n'));

      const poster = new BrowserPoster(config);

      try {
        await poster.interactiveLogin();
        console.log(chalk.green('\nSession saved! You can now post with `absurdity-index post`.'));
        console.log(chalk.dim(`State stored at: ${config.browserStatePath}\n`));
      } catch (err) {
        console.error(chalk.red('\nLogin failed:'), err);
        process.exit(1);
      }
    });
}
