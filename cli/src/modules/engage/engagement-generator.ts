import { getLogger } from '../../utils/logger.js';
import { cleanContent, billUrl } from '../../utils/format.js';
import { runHotPotDetector, type SafetyResult } from '../safety/hot-pot-detector.js';
import type { ClaudeClient } from '../claude/client.js';
import type { BrowserPoster } from '../x-api/browser-poster.js';
import type { Config } from '../../config.js';
import type { Opportunity } from '../state/models/opportunities.js';
import type { LoadedBill } from '../bills/loader.js';
import type { PromptType, PromptContext } from '../claude/prompts/index.js';

const log = getLogger();

export interface EngagementResult {
  success: boolean;
  content: string | null;
  action: 'reply' | 'quote' | 'skip';
  safetyResult: SafetyResult | null;
  skipReason: string | null;
}

interface GenerateOptions {
  opportunity: Opportunity;
  bills: LoadedBill[];
  claude: ClaudeClient;
  poster: BrowserPoster;
  config: Config;
  dryRun: boolean;
}

/**
 * Generate and execute an engagement (reply or quote-tweet) for an opportunity.
 */
export async function executeEngagement(options: GenerateOptions): Promise<EngagementResult> {
  const { opportunity, bills, claude, poster, config, dryRun } = options;
  const tweetUrl = `https://x.com/i/status/${opportunity.tweet_id}`;

  // Determine engagement type
  const action = opportunity.matched_bill_slug ? 'quote' : 'reply';
  const promptType: PromptType = action === 'quote' ? 'quote-dunk' : 'reply-dunk';

  // Build context
  const promptContext: PromptContext = {
    quoteTweetText: opportunity.text,
    quoteTweetAuthor: opportunity.author_username ?? opportunity.author_id,
  };

  // If we matched a bill, enrich context with bill info and link
  if (opportunity.matched_bill_slug) {
    const bill = bills.find(b => b.slug === opportunity.matched_bill_slug);
    if (bill) {
      promptContext.bill = bill;
      promptContext.siteUrl = billUrl(bill.slug, config.siteUrl);
      promptContext.additionalContext = `This tweet relates to ${bill.title} (${bill.billNumber})`;
    }
  }

  // Generate content via Claude
  log.info({ action, promptType, tweetId: opportunity.tweet_id }, 'Generating engagement');
  const result = await claude.generate(promptType, promptContext);
  const content = cleanContent(result.content);

  // Check for SKIP response
  if (content === 'SKIP' || content === 'skip') {
    log.info({ tweetId: opportunity.tweet_id }, 'Claude says SKIP');
    return {
      success: false,
      content: null,
      action: 'skip',
      safetyResult: null,
      skipReason: 'Claude returned SKIP — content not suitable for engagement',
    };
  }

  // Safety check via HotPotDetector
  const safetyResult = await runHotPotDetector({ content, claude, config });

  if (safetyResult.verdict === 'REJECT') {
    log.warn(
      { tweetId: opportunity.tweet_id, score: safetyResult.score, reasons: safetyResult.reasons },
      'Engagement REJECTED by safety'
    );
    return {
      success: false,
      content,
      action,
      safetyResult,
      skipReason: `Safety REJECTED: ${safetyResult.reasons.join(', ')}`,
    };
  }

  if (safetyResult.verdict === 'REVIEW') {
    log.warn(
      { tweetId: opportunity.tweet_id, score: safetyResult.score },
      'Engagement queued for REVIEW'
    );
    return {
      success: false,
      content,
      action,
      safetyResult,
      skipReason: `Safety REVIEW required (score: ${safetyResult.score})`,
    };
  }

  // Post the engagement
  if (dryRun) {
    log.info({ action, content: content.slice(0, 80) }, '[DRY RUN] Would post engagement');
    return { success: true, content, action, safetyResult, skipReason: null };
  }

  try {
    const postResult = action === 'quote'
      ? await poster.quoteTweet(content, tweetUrl)
      : await poster.replyToTweet(content, tweetUrl);

    if (postResult.success) {
      log.info({ action, tweetId: opportunity.tweet_id }, 'Engagement posted');
      return { success: true, content, action, safetyResult, skipReason: null };
    }

    return {
      success: false,
      content,
      action,
      safetyResult,
      skipReason: 'Browser posting failed',
    };
  } catch (err) {
    log.error({ err, tweetId: opportunity.tweet_id }, 'Engagement posting error');
    return {
      success: false,
      content,
      action,
      safetyResult,
      skipReason: `Post error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Use Claude to evaluate an ambiguous opportunity (score 40-60).
 * Returns an updated score and recommended action.
 */
export async function evaluateWithClaude(
  opportunity: Opportunity,
  claude: ClaudeClient,
): Promise<{ score: number; action: 'reply' | 'quote' | 'skip'; reason: string }> {
  try {
    const result = await claude.generate('engagement-evaluate', {
      quoteTweetText: opportunity.text,
      quoteTweetAuthor: opportunity.author_username ?? opportunity.author_id,
      additionalContext: `Likes: ${opportunity.likes}, Retweets: ${opportunity.retweets}, Replies: ${opportunity.replies}`,
    });

    const content = result.content;
    const scoreMatch = content.match(/SCORE:\s*(\d+)/);
    const actionMatch = content.match(/ACTION:\s*(reply|quote|skip)/i);
    const reasonMatch = content.match(/REASON:\s*(.+)/);

    return {
      score: scoreMatch ? Math.min(parseInt(scoreMatch[1]!, 10), 100) : opportunity.score,
      action: (actionMatch?.[1]?.toLowerCase() as 'reply' | 'quote' | 'skip') ?? 'skip',
      reason: reasonMatch?.[1] ?? 'No reason provided',
    };
  } catch (err) {
    log.warn({ err, tweetId: opportunity.tweet_id }, 'Claude evaluation failed');
    return { score: opportunity.score, action: 'skip', reason: 'Evaluation failed' };
  }
}
