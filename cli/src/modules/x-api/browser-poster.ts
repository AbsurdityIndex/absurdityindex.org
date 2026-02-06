import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';
import type { Config } from '../../config.js';

const COMPOSE_SELECTOR = '[data-testid="tweetTextarea_0"]';
const POST_BUTTON_SELECTOR = '[data-testid="tweetButton"]';
const REPLY_BUTTON_SELECTOR = '[data-testid="tweetButtonInline"]';
const FILE_INPUT_SELECTOR = 'input[data-testid="fileInput"]';

export interface PostResult {
  success: boolean;
  tweetUrl?: string;
}

/**
 * Posts to X via browser automation (Playwright).
 * Eliminates need for OAuth write credentials — uses saved browser session.
 *
 * First-time setup: run `absurdity-index login` to authenticate interactively.
 */
export class BrowserPoster {
  private context: BrowserContext | null = null;
  private browser: Browser | null = null;
  private log = getLogger();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private get statePath(): string {
    return path.join(this.config.browserStatePath, 'state.json');
  }

  private hasState(): boolean {
    return fs.existsSync(this.statePath);
  }

  private async launch(): Promise<BrowserContext> {
    if (this.context) return this.context;

    if (!this.hasState()) {
      throw new Error(
        'No browser session found. Run `absurdity-index login` first to authenticate with X.'
      );
    }

    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({
      storageState: this.statePath,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    return this.context;
  }

  /**
   * Open a headed browser for interactive X login.
   * User authenticates manually, then we save the session.
   */
  async interactiveLogin(): Promise<void> {
    fs.mkdirSync(this.config.browserStatePath, { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle' });

    console.log('\n  Log in to your X account in the browser window.');
    console.log('  Once logged in and on your home feed, press Enter here to save session.\n');

    // Wait for user to press Enter in terminal
    await new Promise<void>((resolve) => {
      process.stdin.setRawMode?.(false);
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    // Save session state
    await context.storageState({ path: this.statePath });
    await browser.close();

    this.log.info('Browser session saved');
  }

  async ensureLoggedIn(page: Page): Promise<boolean> {
    await page.goto('https://x.com/home', { waitUntil: 'networkidle', timeout: 15000 });

    // If redirected to login, session is expired
    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) {
      this.log.warn('Session expired — re-run `absurdity-index login`');
      return false;
    }

    return true;
  }

  private async attachMedia(page: Page, mediaPath: string): Promise<boolean> {
    try {
      // X's compose area has a hidden file input we can use directly
      const fileInput = page.locator(FILE_INPUT_SELECTOR);
      await fileInput.setInputFiles(mediaPath);

      // Wait for media preview to appear (thumbnail loads)
      await page.waitForSelector('[data-testid="attachments"]', { timeout: 10000 });
      this.log.info({ mediaPath }, 'Media attached via browser');
      return true;
    } catch (err) {
      // Fallback: use filechooser event if the hidden input selector changed
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }),
          page.locator('[data-testid="fileInput"]').click(),
        ]);
        await fileChooser.setFiles(mediaPath);
        await page.waitForSelector('[data-testid="attachments"]', { timeout: 10000 });
        this.log.info({ mediaPath }, 'Media attached via filechooser fallback');
        return true;
      } catch {
        this.log.warn({ err, mediaPath }, 'Failed to attach media in browser — posting text-only');
        return false;
      }
    }
  }

  async postTweet(text: string, opts?: { mediaPath?: string }): Promise<PostResult> {
    if (this.config.dryRun) {
      this.log.info({ text: text.slice(0, 80) }, '[DRY RUN] Would post tweet via browser');
      return { success: true };
    }

    const context = await this.launch();
    const page = await context.newPage();

    try {
      const loggedIn = await this.ensureLoggedIn(page);
      if (!loggedIn) {
        return { success: false };
      }

      // Click compose area
      await page.click(COMPOSE_SELECTOR, { timeout: 10000 });

      // Attach media before typing text (if provided)
      if (opts?.mediaPath) {
        await this.attachMedia(page, opts.mediaPath);
      }

      await page.keyboard.type(text, { delay: 15 });

      // Small delay to let X process the input
      await page.waitForTimeout(500);

      // Click the post button
      await page.click(POST_BUTTON_SELECTOR, { timeout: 5000 });

      // Wait for the tweet to be posted (compose box clears or toast appears)
      await page.waitForTimeout(3000);

      this.log.info('Tweet posted via browser');
      return { success: true };
    } catch (err) {
      this.log.error({ err }, 'Failed to post tweet via browser');
      return { success: false };
    } finally {
      await page.close();
    }
  }

  async postThread(tweets: string[]): Promise<PostResult> {
    if (this.config.dryRun) {
      this.log.info({ count: tweets.length }, '[DRY RUN] Would post thread via browser');
      return { success: true };
    }

    if (tweets.length === 0) return { success: false };

    const context = await this.launch();
    const page = await context.newPage();

    try {
      const loggedIn = await this.ensureLoggedIn(page);
      if (!loggedIn) return { success: false };

      // Post the first tweet
      await page.click(COMPOSE_SELECTOR, { timeout: 10000 });
      await page.keyboard.type(tweets[0]!, { delay: 15 });
      await page.waitForTimeout(500);
      await page.click(POST_BUTTON_SELECTOR, { timeout: 5000 });
      await page.waitForTimeout(3000);

      // For subsequent tweets, find our latest tweet and reply to it
      for (let i = 1; i < tweets.length; i++) {
        // Navigate to our profile to find the tweet we just posted
        await page.goto('https://x.com/home', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Find and click the reply button on our latest tweet
        const replyButtons = page.locator('[data-testid="reply"]');
        await replyButtons.first().click({ timeout: 5000 });
        await page.waitForTimeout(1000);

        // Type reply
        const replyBox = page.locator(COMPOSE_SELECTOR);
        await replyBox.click({ timeout: 5000 });
        await page.keyboard.type(tweets[i]!, { delay: 15 });
        await page.waitForTimeout(500);

        // Post reply
        await page.click(REPLY_BUTTON_SELECTOR, { timeout: 5000 });
        await page.waitForTimeout(3000);
      }

      this.log.info({ count: tweets.length }, 'Thread posted via browser');
      return { success: true };
    } catch (err) {
      this.log.error({ err }, 'Failed to post thread via browser');
      return { success: false };
    } finally {
      await page.close();
    }
  }

  async quoteTweet(text: string, tweetUrl: string): Promise<PostResult> {
    if (this.config.dryRun) {
      this.log.info({ text: text.slice(0, 80), tweetUrl }, '[DRY RUN] Would quote-tweet via browser');
      return { success: true };
    }

    const context = await this.launch();
    const page = await context.newPage();

    try {
      const loggedIn = await this.ensureLoggedIn(page);
      if (!loggedIn) return { success: false };

      // Navigate to the tweet to quote
      await page.goto(tweetUrl, { waitUntil: 'networkidle', timeout: 15000 });

      // Click retweet button to get the menu
      const retweetButton = page.locator('[data-testid="retweet"]');
      await retweetButton.click({ timeout: 5000 });

      // Click "Quote" option from the dropdown
      const quoteOption = page.getByText('Quote', { exact: true });
      await quoteOption.click({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // Type quote text
      const composeBox = page.locator(COMPOSE_SELECTOR);
      await composeBox.click({ timeout: 5000 });
      await page.keyboard.type(text, { delay: 15 });
      await page.waitForTimeout(500);

      // Post the quote
      await page.click(POST_BUTTON_SELECTOR, { timeout: 5000 });
      await page.waitForTimeout(3000);

      this.log.info('Quote-tweet posted via browser');
      return { success: true };
    } catch (err) {
      this.log.error({ err }, 'Failed to quote-tweet via browser');
      return { success: false };
    } finally {
      await page.close();
    }
  }

  async replyToTweet(text: string, tweetUrl: string): Promise<PostResult> {
    if (this.config.dryRun) {
      this.log.info({ text: text.slice(0, 80), tweetUrl }, '[DRY RUN] Would reply via browser');
      return { success: true };
    }

    const context = await this.launch();
    const page = await context.newPage();

    try {
      const loggedIn = await this.ensureLoggedIn(page);
      if (!loggedIn) return { success: false };

      // Navigate to the tweet to reply to
      await page.goto(tweetUrl, { waitUntil: 'networkidle', timeout: 15000 });

      // Click the reply button on the tweet
      const replyButton = page.locator('[data-testid="reply"]');
      await replyButton.first().click({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // Type reply text in the compose box
      const composeBox = page.locator(COMPOSE_SELECTOR);
      await composeBox.click({ timeout: 5000 });
      await page.keyboard.type(text, { delay: 15 });
      await page.waitForTimeout(500);

      // Post the reply
      await page.click(REPLY_BUTTON_SELECTOR, { timeout: 5000 });
      await page.waitForTimeout(3000);

      this.log.info('Reply posted via browser');
      return { success: true };
    } catch (err) {
      this.log.error({ err }, 'Failed to reply via browser');
      return { success: false };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }
}
