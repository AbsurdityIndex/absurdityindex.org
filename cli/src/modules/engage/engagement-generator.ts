import { getLogger } from '../../utils/logger.js';
import { cleanContent, billUrl } from '../../utils/format.js';
import { runHotPotDetector, type SafetyResult } from '../safety/hot-pot-detector.js';
import type { ClaudeClient } from '../claude/client.js';
import type { XReadClient, XWriteClient } from '../x-api/client.js';
import { fetchTweetContext } from '../x-api/tweet-context.js';
import type { TweetContext } from '../x-api/tweet-context.js';
import type { ResearchResult } from '../claude/prompts/research.js';
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
  tweetId?: string;
}

interface GenerateOptions {
  opportunity: Opportunity;
  bills: LoadedBill[];
  claude: ClaudeClient;
  xReader: XReadClient;
  xWriter?: XWriteClient;
  config: Config;
  dryRun: boolean;
  preferredAction?: 'quote' | 'reply';
}

/**
 * Generate and execute an engagement (reply or quote-tweet) for an opportunity.
 * Uses the full pipeline: fetch context → research → generate → fact-check → safety → post.
 */
export async function executeEngagement(options: GenerateOptions): Promise<EngagementResult> {
  const { opportunity, bills, claude, xReader, xWriter, config, dryRun, preferredAction } = options;

  // [0] FETCH — Unpack full tweet tree
  let tweetContext: TweetContext | null = null;
  try {
    tweetContext = await fetchTweetContext(xReader, opportunity.tweet_id);
  } catch (err) {
    log.warn({ err, tweetId: opportunity.tweet_id }, 'Failed to fetch tweet context — falling back');
  }

  // [1] RESEARCH — Sonnet analyzes full context
  let researchResult: ResearchResult | undefined;
  if (tweetContext) {
    try {
      // Find matching bill for research context
      let billContext = undefined;
      if (opportunity.matched_bill_slug) {
        const bill = bills.find(b => b.slug === opportunity.matched_bill_slug);
        if (bill) billContext = bill;
      }

      const research = await claude.research(tweetContext, billContext);
      researchResult = research.result;

      if (!researchResult.shouldEngage) {
        log.info(
          { tweetId: opportunity.tweet_id, reason: researchResult.skipReason },
          'Research says skip'
        );
        return {
          success: false,
          content: null,
          action: 'skip',
          safetyResult: null,
          skipReason: `Research: ${researchResult.skipReason ?? 'Not suitable for engagement'}`,
        };
      }

      log.info(
        { tweetId: opportunity.tweet_id, facts: researchResult.verifiableFacts.length },
        'Research complete'
      );
    } catch (err) {
      log.warn({ err, tweetId: opportunity.tweet_id }, 'Research step failed — falling back to input safety check');
    }
  }

  // Fallback: if no research step ran, use legacy input safety check
  if (!researchResult) {
    const inputSafety = await checkInputSafety(opportunity.text, claude);
    if (inputSafety.skip) {
      log.info({ tweetId: opportunity.tweet_id, reason: inputSafety.reason }, 'Input safety — skipping');
      return {
        success: false,
        content: null,
        action: 'skip',
        safetyResult: null,
        skipReason: `Input safety: ${inputSafety.reason}`,
      };
    }
  }

  // [2] GENERATE — Opus creates content with research grounding
  const action: 'quote' | 'reply' = preferredAction ?? 'quote';
  const promptType: PromptType = action === 'quote' ? 'quote-dunk' : 'reply-dunk';

  const promptContext: PromptContext = {
    quoteTweetText: opportunity.text,
    quoteTweetAuthor: opportunity.author_username ?? opportunity.author_id,
    tweetContext: tweetContext ?? undefined,
    researchResult,
  };

  if (opportunity.matched_bill_slug) {
    const bill = bills.find(b => b.slug === opportunity.matched_bill_slug);
    if (bill) {
      promptContext.bill = bill;
      promptContext.siteUrl = billUrl(bill.slug, config.siteUrl);
      promptContext.additionalContext = `This tweet relates to ${bill.title} (${bill.billNumber})`;
    }
  }

  log.info({ action, promptType, tweetId: opportunity.tweet_id }, 'Generating engagement');
  const result = await claude.generate(promptType, promptContext);
  let content = cleanContent(result.content);

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

  // [3] FACT-CHECK — Sonnet validates generated content
  if (tweetContext && researchResult) {
    try {
      const factCheck = await claude.factCheck(content, tweetContext, researchResult);

      if (factCheck.result.verdict === 'REJECT') {
        log.warn(
          { tweetId: opportunity.tweet_id, issues: factCheck.result.issues },
          'Fact-check REJECTED'
        );
        return {
          success: false,
          content,
          action,
          safetyResult: null,
          skipReason: `Fact-check REJECTED: ${factCheck.result.issues.map(i => i.claim).join('; ')}`,
        };
      }

      if (factCheck.result.verdict === 'FLAG' && factCheck.result.cleanedContent) {
        log.info(
          { tweetId: opportunity.tweet_id, issueCount: factCheck.result.issues.length },
          'Fact-check flagged — using cleaned version'
        );
        content = factCheck.result.cleanedContent;
      }
    } catch (err) {
      log.warn({ err, tweetId: opportunity.tweet_id }, 'Fact-check step failed — proceeding with caution');
    }
  }

  // [4] SAFETY — Existing hot-pot detector
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

  if (!xWriter) {
    log.warn({ tweetId: opportunity.tweet_id, action }, 'X writer not configured — cannot post engagement');
    return {
      success: false,
      content,
      action,
      safetyResult,
      skipReason: 'X writer not configured',
    };
  }

  try {
    const postResult = action === 'quote'
      ? await xWriter.quote(content, opportunity.tweet_id)
      : await xWriter.reply(content, opportunity.tweet_id);

    if (postResult.success) {
      log.info({ action, tweetId: opportunity.tweet_id, postedUrl: postResult.tweetUrl }, 'Engagement posted');

      // Post CTA reply with bill link if we have a tweetId and matched bill
      if (postResult.tweetId && opportunity.matched_bill_slug) {
        try {
          const bill = bills.find(b => b.slug === opportunity.matched_bill_slug);
          const replyText = bill
            ? `Read the full breakdown:\n${billUrl(bill.slug, config.siteUrl)}`
            : `More at ${config.siteUrl}`;
          const replyResult = await xWriter.reply(replyText, postResult.tweetId);
          if (replyResult.success) {
            log.info({ replyTweetId: replyResult.tweetId }, 'CTA reply posted on engagement');
          }
        } catch (err) {
          log.warn({ err }, 'CTA reply failed on engagement — non-fatal');
        }
      }

      return { success: true, content, action, safetyResult, skipReason: null, tweetId: postResult.tweetId };
    }

    return {
      success: false,
      content,
      action,
      safetyResult,
      skipReason: 'API posting failed',
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

/**
 * Input-side safety check: evaluate the ORIGINAL tweet before engaging.
 * Catches sensitive topics that our output safety checks would miss.
 */
async function checkInputSafety(
  tweetText: string,
  claude: ClaudeClient,
): Promise<{ skip: boolean; reason: string }> {
  try {
    const result = await claude.analyzeSafety(tweetText, `You are a safety filter for a satirical political account. Evaluate whether this tweet is safe to ENGAGE WITH (quote-tweet with commentary). We must NEVER engage with tweets about:

- Personal tragedies, health crises, deaths, illness, or medical emergencies
- Children in danger, sick children, premature babies, child abuse
- Active shootings, terrorist attacks, natural disasters
- Grief, mourning, memorials, funerals
- Domestic violence, sexual assault, abuse
- Suicide, self-harm, mental health crises
- War casualties, refugees, humanitarian crises
- Anyone's personal medical condition or diagnosis

We ONLY engage with tweets about legislation, policy, government spending, congressional behavior, elections, and political rhetoric.

Respond in this exact format:
SAFE: yes or no
REASON: [one sentence explanation]`);

    const safeMatch = result.text.match(/SAFE:\s*(yes|no)/i);
    const reasonMatch = result.text.match(/REASON:\s*(.+)/);

    if (safeMatch?.[1]?.toLowerCase() === 'no') {
      return { skip: true, reason: reasonMatch?.[1] ?? 'Sensitive topic detected' };
    }

    return { skip: false, reason: '' };
  } catch {
    // If safety check fails, err on the side of caution
    return { skip: true, reason: 'Input safety check failed — skipping to be safe' };
  }
}
