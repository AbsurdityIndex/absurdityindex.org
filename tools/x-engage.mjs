#!/usr/bin/env node
/**
 * MCP Server: X Engagement Tool
 *
 * Exposes a `engage_tweet` tool that:
 *   1. Fetches a tweet by URL or ID
 *   2. Uses Claude to generate an in-depth, contextual reply about VoteChain (no link)
 *   3. Posts the reply via X API
 *
 * Also exposes `engage_tweet_with_link` for when you DO want the link included.
 *
 * Registered in .mcp.json — Claude Code auto-discovers it.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(PROJECT_ROOT, 'cli/node_modules/'));
const { TwitterApi } = require('twitter-api-v2');
const Anthropic = require('@anthropic-ai/sdk').default;

// ── Load .env ────────────────────────────────────────────────────────
const envText = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

// ── Clients ──────────────────────────────────────────────────────────
const readClient = new TwitterApi(env.X_BEARER_TOKEN);
const writeClient = new TwitterApi({
  appKey: env.X_API_KEY,
  appSecret: env.X_API_SECRET,
  accessToken: env.X_ACCESS_TOKEN,
  accessSecret: env.X_ACCESS_SECRET,
});
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ── VoteChain context for Claude ─────────────────────────────────────
const VOTECHAIN_CONTEXT = `You are replying to a tweet on X (Twitter) on behalf of the @CartelPirate account. You are engaging in a conversation about election security, voter verification, or related topics.

You have deep knowledge of VoteChain — a 1,525-line technical spec for voter verification. Here are the key points you can draw from:

CORE CONCEPT:
- A permissioned government blockchain (NOT crypto tokens, NOT NFTs) that verifies voter eligibility
- Uses zero-knowledge proofs to confirm: citizen? eligible? alive? already voted? — without storing personal data
- The system only stores cryptographic yes/no — never names, SSNs, addresses, or any PII
- It is architecturally incapable of storing identity

TRUST MODEL:
- Fully open source — every line of code published publicly
- Quarterly audits by an independent security firm
- The auditor is chosen by 25 randomly selected citizens (like jury duty for picking the watchdog)
- No single party, agency, or contractor controls the system — it belongs to the people

KEY DIFFERENTIATORS:
- Doesn't require showing ID every time you vote
- Catches fraud in seconds, not months
- Doesn't track how you vote
- Costs voters nothing
- No tokens, no fees, no crypto nonsense
- The government already has your documents (SSN, birth certificate, passport) — VoteChain never sees them

PHILOSOPHY:
- "The system is broken" without proposing something better is just a bumper sticker
- The Constitution wasn't right the first time either — amended 27 times
- VoteChain is published specifically to be torn apart and improved
- Making it easy to vote and hard to cheat are NOT opposing goals

RULES FOR YOUR REPLY:
1. Be substantive and in-depth — engage with the SPECIFIC point the tweet is making
2. Draw from VoteChain concepts naturally, as if you're someone who deeply understands this space
3. Match the tone of the conversation — serious for policy, technical for tech discussions
4. Do NOT sound like a bot or a sales pitch
5. Do NOT use hashtags
6. Keep it under 280 characters ONLY if the tweet is casual. For substantive policy/tech discussions, use the full character limit (up to 4000 chars on X)
7. Sound like a real person who has thought deeply about this problem
8. NEVER offer to brief, meet, DM, chat, connect, or have any direct conversation with anyone. You are an anonymous voice — no "happy to discuss," no "reach out," no "let's talk." The ideas speak for themselves.
9. NEVER reveal or imply there is a person, team, or organization behind the account. Speak as ideas, not as someone with an identity.`;

// ── Substantive-only context (no VoteChain) ─────────────────────────
const SUBSTANTIVE_CONTEXT = `You are replying to a tweet on X (Twitter) on behalf of the @CartelPirate account. You are engaging in a conversation about legislation, policy, government, or civic issues.

You are someone who has deeply researched actual legislation and can cite real facts, statistics, and sources. You do NOT promote any product, project, or platform. You build credibility through knowledge.

KNOWLEDGE BASE:
- You have encyclopedic knowledge of U.S. legislation, congressional procedures, and voting records
- You cite real statistics from authoritative sources (Heritage Foundation, Brennan Center, CBO, Congress.gov, GAO, etc.)
- You understand the gap between political rhetoric and legislative reality
- You know that many "common sense" bills have unintended consequences or solve problems that barely exist
- You track how bills evolve across multiple Congresses and how they actually impact citizens

TONE:
- Thoughtful, not combative
- Factual, not partisan
- You engage with the SUBSTANCE of what someone is saying, not the tribal signaling
- You ask good questions that make people think
- You acknowledge valid points on any side while adding context that's often missing

RULES FOR YOUR REPLY:
1. Be substantive — engage with the SPECIFIC point the tweet is making
2. Lead with facts, data, or a question that reframes the debate
3. Do NOT mention VoteChain, blockchain, or any product/platform
4. Do NOT include links unless citing a specific statistic (use the source name instead, e.g. "per the Heritage Foundation's fraud database")
5. Do NOT sound like a bot or a sales pitch
6. Do NOT use hashtags
7. Keep it under 280 characters ONLY if the tweet is casual. For substantive policy/tech discussions, use up to 2000 chars — enough to make your point without writing an essay
8. Sound like a real person who reads legislation for fun and has opinions about it
9. NEVER offer to brief, meet, DM, chat, connect, or have any direct conversation with anyone. You are an anonymous voice — no "happy to discuss," no "reach out," no "let's talk." The ideas speak for themselves.
10. NEVER reveal or imply there is a person, team, or organization behind the account. Speak as ideas, not as someone with an identity.`;

// ── Helper: extract tweet ID from URL or raw ID ──────────────────────
function extractTweetId(input) {
  const match = input.match(/status\/(\d+)/);
  if (match) return match[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  throw new Error(`Could not extract tweet ID from: ${input}`);
}

// ── Helper: fetch tweet ──────────────────────────────────────────────
async function fetchTweet(tweetId) {
  const res = await readClient.v2.singleTweet(tweetId, {
    'tweet.fields': ['public_metrics', 'created_at', 'author_id', 'text', 'conversation_id', 'referenced_tweets'],
    expansions: ['author_id', 'referenced_tweets.id', 'referenced_tweets.id.author_id'],
    'user.fields': ['username', 'name', 'public_metrics'],
  });
  const user = res.includes?.users?.[0];

  // ── Resolve referenced tweets (quote tweets, retweets) ────────────
  let referencedContext = null;
  const refs = res.data.referenced_tweets;
  if (refs?.length && res.includes?.tweets?.length) {
    const parts = [];
    for (const ref of refs) {
      const refTweet = res.includes.tweets.find(t => t.id === ref.id);
      if (!refTweet) continue;
      const refUser = res.includes.users?.find(u => u.id === refTweet.author_id);
      const label = ref.type === 'quoted' ? 'Quote-tweeting'
        : ref.type === 'retweeted' ? 'Retweeting'
        : ref.type === 'replied_to' ? 'Replying to'
        : 'Referencing';
      parts.push({
        type: ref.type,
        label,
        text: refTweet.text,
        author: refUser?.name ?? 'Unknown',
        username: refUser?.username ?? 'unknown',
      });
    }
    if (parts.length) referencedContext = parts;
  }

  return {
    id: tweetId,
    text: res.data.text,
    author: user?.name ?? 'Unknown',
    username: user?.username ?? 'unknown',
    followers: user?.public_metrics?.followers_count ?? 0,
    metrics: res.data.public_metrics,
    referencedContext,
  };
}

// ── Helper: build tweet context block ────────────────────────────────
function buildContextBlock(tweet) {
  let contextBlock = `Reply to this tweet from @${tweet.username} (${tweet.followers.toLocaleString()} followers):\n\n"${tweet.text}"`;

  if (tweet.referencedContext?.length) {
    const refLines = tweet.referencedContext.map(ref =>
      `${ref.label} @${ref.username} (${ref.author}):\n"${ref.text}"`
    ).join('\n\n');
    contextBlock += `\n\n── Referenced content ──\n${refLines}\n── End referenced content ──\n\nIMPORTANT: The referenced content above is what gives this tweet its meaning. Engage with BOTH the original tweet and the referenced content.`;
  }

  contextBlock += `\n\nGenerate a single reply tweet. No preamble, no explanation — just the tweet text itself.`;
  return contextBlock;
}

// ── Helper: generate VoteChain reply (no link) ──────────────────────
async function generateReply(tweet) {
  const linkInstruction = '\n8. Do NOT include any links. Just discuss the concepts substantively.';

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: VOTECHAIN_CONTEXT + linkInstruction,
    messages: [{ role: 'user', content: buildContextBlock(tweet) }],
  });

  return msg.content[0].text.trim();
}

// ── Helper: generate reply with a custom link ───────────────────────
async function generateReplyWithLink(tweet, linkUrl, linkContext) {
  let systemPrompt;

  if (linkContext) {
    // Custom context provided — use substantive mode with the caller's framing
    systemPrompt = SUBSTANTIVE_CONTEXT
      + `\n\nPAGE CONTEXT FOR THE LINK YOU WILL INCLUDE:\n${linkContext}`
      + `\n\nRULE: Include the link ${linkUrl} naturally in your reply — weave it in where it adds value, or place it at the end.`;
  } else {
    // No custom context — default to VoteChain mode
    systemPrompt = VOTECHAIN_CONTEXT
      + `\n8. Include the link ${linkUrl} naturally at the end of your reply.`;
  }

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildContextBlock(tweet) }],
  });

  return msg.content[0].text.trim();
}

// ── Helper: generate substantive reply (no VoteChain) ────────────────
async function generateSubstantiveReply(tweet) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: SUBSTANTIVE_CONTEXT,
    messages: [{ role: 'user', content: buildContextBlock(tweet) }],
  });

  return msg.content[0].text.trim();
}

// ── MCP Server ───────────────────────────────────────────────────────
const server = new McpServer({
  name: 'x-engage',
  version: '1.0.0',
});

server.tool(
  'engage_tweet',
  'Reply to a tweet with an in-depth, contextual response about VoteChain concepts. No link included — pure substantive engagement. Pass a tweet URL or tweet ID.',
  { tweet_url: z.string().describe('Tweet URL (e.g. https://x.com/user/status/123) or tweet ID') },
  async ({ tweet_url }) => {
    try {
      const tweetId = extractTweetId(tweet_url);
      const tweet = await fetchTweet(tweetId);
      const reply = await generateReply(tweet);

      const result = await writeClient.v2.reply(reply, tweetId);
      const replyUrl = `https://x.com/i/status/${result.data.id}`;

      return {
        content: [{
          type: 'text',
          text: `OK  Reply posted to @${tweet.username}\n\nOriginal: "${tweet.text.slice(0, 150)}..."\n\nReply: "${reply}"\n\nURL: ${replyUrl}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `ERR Failed: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'engage_tweet_with_link',
  'Reply to a tweet with an in-depth response AND include a link. Defaults to absurdityindex.org/votechain if no link_url provided. Pass optional link_context to guide the reply with specific facts/framing for the linked page.',
  {
    tweet_url: z.string().describe('Tweet URL (e.g. https://x.com/user/status/123) or tweet ID'),
    link_url: z.string().optional().describe('URL to include in the reply (default: absurdityindex.org/votechain)'),
    link_context: z.string().optional().describe('Context about the linked page — key facts, framing, tone guidance — so Claude can craft a relevant reply'),
  },
  async ({ tweet_url, link_url, link_context }) => {
    try {
      const tweetId = extractTweetId(tweet_url);
      const tweet = await fetchTweet(tweetId);
      const resolvedLink = link_url || 'absurdityindex.org/votechain';
      const reply = await generateReplyWithLink(tweet, resolvedLink, link_context);

      const result = await writeClient.v2.reply(reply, tweetId);
      const replyUrl = `https://x.com/i/status/${result.data.id}`;

      return {
        content: [{
          type: 'text',
          text: `OK  Reply posted to @${tweet.username}\n\nOriginal: "${tweet.text.slice(0, 150)}..."\n\nReply: "${reply}"\n\nURL: ${replyUrl}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `ERR Failed: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'engage_tweet_substantive',
  'Reply to a tweet with a fact-driven, substantive response. NO VoteChain, NO product pitch — just sharp policy commentary and real data. Builds credibility and authority. Pass a tweet URL or tweet ID.',
  { tweet_url: z.string().describe('Tweet URL (e.g. https://x.com/user/status/123) or tweet ID') },
  async ({ tweet_url }) => {
    try {
      const tweetId = extractTweetId(tweet_url);
      const tweet = await fetchTweet(tweetId);
      const reply = await generateSubstantiveReply(tweet);

      const result = await writeClient.v2.reply(reply, tweetId);
      const replyUrl = `https://x.com/i/status/${result.data.id}`;

      return {
        content: [{
          type: 'text',
          text: `OK  Reply posted to @${tweet.username} (substantive mode — no VoteChain)\n\nOriginal: "${tweet.text.slice(0, 150)}..."\n\nReply: "${reply}"\n\nURL: ${replyUrl}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `ERR Failed: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'fetch_tweet',
  'Fetch a tweet\'s text, author, and engagement metrics without replying. Useful for reading a tweet before deciding how to engage.',
  { tweet_url: z.string().describe('Tweet URL or tweet ID') },
  async ({ tweet_url }) => {
    try {
      const tweetId = extractTweetId(tweet_url);
      const tweet = await fetchTweet(tweetId);

      let display = `@${tweet.username} (${tweet.author}, ${tweet.followers.toLocaleString()} followers)\n\n"${tweet.text}"`;

      if (tweet.referencedContext?.length) {
        const refLines = tweet.referencedContext.map(ref =>
          `-> ${ref.label} @${ref.username} (${ref.author}): "${ref.text}"`
        ).join('\n');
        display += `\n\n${refLines}`;
      }

      display += `\n\nLikes: ${tweet.metrics?.like_count ?? 0}  Reposts: ${tweet.metrics?.retweet_count ?? 0}  Replies: ${tweet.metrics?.reply_count ?? 0}  Impressions: ${tweet.metrics?.impression_count ?? 0}`;

      return {
        content: [{
          type: 'text',
          text: display,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `ERR Failed: ${err.message}` }],
        isError: true,
      };
    }
  },
);

// ── Start ────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
