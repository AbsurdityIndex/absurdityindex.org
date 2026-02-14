#!/usr/bin/env node
/**
 * OG Image Generator
 *
 * Generates 1200×630 PNG Open Graph images for every page by rendering
 * HTML templates in Playwright and screenshotting them.
 *
 * Usage:
 *   node scripts/generate-og-images.mjs              # All pages
 *   node scripts/generate-og-images.mjs --bills-only  # Only bills
 *   node scripts/generate-og-images.mjs --rules-only  # Only rules
 *   node scripts/generate-og-images.mjs --static-only # Only static pages
 *   node scripts/generate-og-images.mjs --force       # Regenerate existing
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const BILLS_DIR = path.join(PROJECT_ROOT, 'src/data/bills');
const RULES_DIR = path.join(PROJECT_ROOT, 'src/data/rules');
const OG_DIR = path.join(PROJECT_ROOT, 'public/og');

// ── CLI Args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const BILLS_ONLY = args.includes('--bills-only');
const STATIC_ONLY = args.includes('--static-only');
const RULES_ONLY = args.includes('--rules-only');
const FORCE = args.includes('--force');
const ALL = !BILLS_ONLY && !STATIC_ONLY && !RULES_ONLY;

// ── ANSI colors ───────────────────────────────────────────────────
const c = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

// ── Static Pages Manifest ─────────────────────────────────────────
const STATIC_PAGES = [
  { slug: 'index', title: 'Absurdity Index', tagline: 'Real bills. Absurd bills. You decide which is which.' },
  { slug: 'about', title: 'About', tagline: 'What is the Absurdity Index?' },
  { slug: 'adopt', title: 'Adopt a Bill', tagline: 'Sponsor your favorite legislation' },
  { slug: 'asmr', title: 'Congressional ASMR', tagline: 'The soothing sounds of democracy' },
  { slug: 'bingo', title: 'Congressional Bingo', tagline: 'Play along at home' },
  { slug: 'bracket', title: 'Absurdity Bracket', tagline: 'March Madness for legislation' },
  { slug: 'calendar', title: 'Legislative Calendar', tagline: 'What Congress is pretending to do' },
  { slug: 'cost-calculator', title: 'Cost Calculator', tagline: 'How much does Congress really cost?' },
  { slug: 'diff', title: 'Bill Diff', tagline: 'See what changed between versions' },
  { slug: 'embed', title: 'Embeddable Widgets', tagline: 'Add absurdity to your own site' },
  { slug: 'extension', title: 'Browser Extension', tagline: 'Absurdity scores on Congress.gov' },
  { slug: 'filibuster', title: 'Filibuster Simulator', tagline: 'How long can you talk about nothing?' },
  { slug: 'generator', title: 'Bill Generator', tagline: 'Create your own legislation' },
  { slug: 'history', title: 'History', tagline: 'A timeline of legislative absurdity' },
  { slug: 'how-we-score', title: 'How We Score', tagline: 'Our absurdity methodology, explained' },
  { slug: 'lobbyists', title: 'Lobbyist Tracker', tagline: 'Follow the money' },
  { slug: 'marathon', title: 'Reading Marathon', tagline: 'Can you read faster than Congress?' },
  { slug: 'pork', title: 'Pork Barrel', tagline: 'Where your tax dollars actually go' },
  { slug: 'pork-index', title: 'Pork Index', tagline: 'Ranking the porkiest bills in Congress' },
  { slug: 'privacy', title: 'Privacy Policy', tagline: 'We respect your data more than Congress does' },
  { slug: 'quiz', title: 'Real or Satire?', tagline: 'Test your knowledge of congressional absurdity' },
  { slug: 'search', title: 'Search', tagline: 'Find bills, rules, and more' },
  { slug: 'security', title: 'Security', tagline: 'How we keep things safe' },
  { slug: 'submit', title: 'Submit a Bill', tagline: 'Suggest legislation for review' },
  { slug: 'swipe', title: 'Bill Swipe', tagline: 'Tinder for legislation' },
  { slug: 'today', title: 'Today in Congress', tagline: "What's happening on the Hill right now" },
  { slug: 'trends', title: 'Trends', tagline: 'Legislative trends and patterns' },
  { slug: 'compare', title: 'Compare', tagline: 'Side-by-side bill comparison' },
  { slug: 'omnibus', title: 'Omnibus Tracker', tagline: 'The biggest bills in Congress' },
  { slug: 'sponsors', title: 'Sponsors', tagline: 'Who writes the laws?' },
  { slug: 'bills', title: 'All Bills', tagline: 'Browse every bill in the Absurdity Index' },
  { slug: 'not-bills', title: 'Not Bills', tagline: 'Satirical legislation that makes too much sense' },
  { slug: 'rules', title: 'Rules', tagline: 'How Congress governs itself' },
  { slug: 'under-consideration', title: 'Under Consideration', tagline: 'Bills we\'re evaluating' },
];

// ── Frontmatter Parser ────────────────────────────────────────────
function parseFrontmatter(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

// ── Official Seal SVG ─────────────────────────────────────────────
function sealSvg(size = 80) {
  const stars = Array.from({ length: 13 }, (_, i) => {
    const angle = ((i * 360) / 13 - 90) * (Math.PI / 180);
    const cx = (100 + 92 * Math.cos(angle)).toFixed(1);
    const cy = (100 + 92 * Math.sin(angle)).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#C5A572"/>`;
  }).join('');

  return `<svg width="${size}" height="${size}" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="96" stroke="#C5A572" stroke-width="3" fill="none"/>
    <circle cx="100" cy="100" r="88" stroke="#C5A572" stroke-width="1.5" fill="none"/>
    ${stars}
    <defs>
      <path id="textCircleTop" d="M 100,100 m -72,0 a 72,72 0 1,1 144,0"/>
      <path id="textCircleBottom" d="M 100,100 m 72,0 a 72,72 0 1,1 -144,0"/>
    </defs>
    <text font-family="'Inter',sans-serif" font-size="10" font-weight="700" fill="#C5A572" letter-spacing="3">
      <textPath href="#textCircleTop" startOffset="50%" text-anchor="middle">ABSURDITY INDEX</textPath>
    </text>
    <text font-family="'Inter',sans-serif" font-size="8.5" font-weight="600" fill="#C5A572" letter-spacing="2.5">
      <textPath href="#textCircleBottom" startOffset="50%" text-anchor="middle">OF THE UNITED STATES</textPath>
    </text>
    <circle cx="100" cy="100" r="55" stroke="#C5A572" stroke-width="1.5" fill="#0A1628"/>
    <g transform="translate(100,95)" fill="#C5A572">
      <ellipse cx="0" cy="5" rx="8" ry="14"/>
      <circle cx="0" cy="-14" r="6"/>
      <polygon points="6,-14 10,-16 6,-12"/>
      <path d="M -8,-2 Q -30,-15 -35,-5 Q -28,-3 -8,5 Z"/>
      <path d="M 8,-2 Q 30,-15 35,-5 Q 28,-3 8,5 Z"/>
      <path d="M -6,18 L 0,28 L 6,18 Q 3,22 0,20 Q -3,22 -6,18 Z"/>
      <rect x="-4" y="-4" width="8" height="12" rx="1" fill="#0A1628" stroke="#C5A572" stroke-width="0.8"/>
      <line x1="0" y1="-4" x2="0" y2="8" stroke="#C5A572" stroke-width="0.5"/>
      <line x1="-4" y1="1" x2="4" y2="1" stroke="#C5A572" stroke-width="0.5"/>
    </g>
  </svg>`;
}

// ── Escape HTML ───────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Shared HTML Wrapper ───────────────────────────────────────────
function wrapHtml(bodyContent) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1200px;
  height: 630px;
  background: #0A1628;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
  position: relative;
}
.border-outer {
  position: absolute;
  inset: 8px;
  border: 2px solid #C5A572;
  border-radius: 4px;
  pointer-events: none;
}
.border-inner {
  position: absolute;
  inset: 14px;
  border: 1px solid rgba(197, 165, 114, 0.4);
  border-radius: 2px;
  pointer-events: none;
}
.content {
  position: absolute;
  inset: 24px;
  display: flex;
  flex-direction: column;
  padding: 28px 36px;
}
.seal-watermark {
  position: absolute;
  bottom: 20px;
  right: 20px;
  opacity: 0.08;
  pointer-events: none;
}
.bill-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #C5A572;
}
.badge {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.badge-real { background: rgba(197, 165, 114, 0.15); color: #C5A572; border: 1px solid rgba(197, 165, 114, 0.4); }
.badge-sensible { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
.badge-absurd { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
.title {
  font-family: 'Libre Caslon Text', serif;
  font-size: 44px;
  font-weight: 700;
  color: #F5F0E8;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.subtitle {
  font-family: 'Libre Caslon Text', serif;
  font-size: 22px;
  font-style: italic;
  color: rgba(197, 165, 114, 0.8);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.category-tag {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(197, 165, 114, 0.1);
  border: 1px solid rgba(197, 165, 114, 0.25);
  border-radius: 4px;
  font-size: 12px;
  color: rgba(197, 165, 114, 0.7);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.meter-bar-bg {
  height: 10px;
  background: rgba(255,255,255,0.08);
  border-radius: 5px;
  overflow: hidden;
  flex: 1;
}
.meter-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(to right, #22c55e, #eab308, #ef4444);
}
.meter-score {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #F5F0E8;
}
.sponsor-text {
  font-size: 15px;
  color: rgba(245, 240, 232, 0.6);
}
.party-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  color: white;
  margin-left: 6px;
  vertical-align: middle;
}
.party-R { background: #dc2626; }
.party-D { background: #2563eb; }
.party-I { background: #7c3aed; }
.branding {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: rgba(197, 165, 114, 0.5);
  letter-spacing: 0.5px;
}
.chamber-badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #F5F0E8;
}
.chamber-house { background: #b91c1c; }
.chamber-senate { background: #1e3a5f; }
.vote-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
}
.vote-yea { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.vote-nay { background: rgba(239, 68, 68, 0.15); color: #f87171; }
</style>
</head>
<body>
<div class="border-outer"></div>
<div class="border-inner"></div>
<div class="seal-watermark">${sealSvg(160)}</div>
${bodyContent}
</body>
</html>`;
}

// ── Bill OG Template ──────────────────────────────────────────────
function renderBillHtml(data) {
  const { title, billNumber, billType, subtitle, category, sponsor, sponsorParty, sponsorState, absurdityIndex } = data;

  const typeLabels = { real: 'Real Bill', sensible: 'Sensible Bill', absurd: 'Absurd Bill' };
  const typeLabel = typeLabels[billType] || 'Bill';

  // Absurdity meter (real bills only)
  let meterHtml = '';
  if (billType === 'real' && absurdityIndex !== undefined) {
    meterHtml = `
    <div style="display: flex; align-items: center; gap: 16px; margin-top: 8px;">
      <div style="font-size: 11px; font-weight: 600; color: rgba(197,165,114,0.6); text-transform: uppercase; letter-spacing: 2px; white-space: nowrap;">Absurdity</div>
      <div class="meter-bar-bg">
        <div class="meter-fill" style="width: ${(absurdityIndex / 10) * 100}%;"></div>
      </div>
      <div class="meter-score">${absurdityIndex}<span style="font-size: 16px; color: rgba(245,240,232,0.4);">/10</span></div>
    </div>`;
  }

  // Sponsor line
  let sponsorHtml = '';
  if (sponsor) {
    const cleanSponsor = sponsor.replace(/^(Rep\.|Sen\.)\s*/, '').trim();
    const stateStr = sponsorState ? ` (${sponsorState})` : '';
    const partyDot = sponsorParty
      ? `<span class="party-dot party-${sponsorParty}">${sponsorParty}</span>`
      : '';
    sponsorHtml = `<span class="sponsor-text">${esc(cleanSponsor)}${esc(stateStr)}${partyDot}</span>`;
  }

  const body = `
<div class="content">
  <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px; flex-wrap: wrap;">
    <span class="bill-number">${esc(billNumber)}</span>
    <span class="badge badge-${billType}">${typeLabel}</span>
    ${category ? `<span class="category-tag">${esc(category)}</span>` : ''}
  </div>
  <div class="title" style="margin-bottom: ${subtitle ? '10px' : '16px'};">${esc(title)}</div>
  ${subtitle ? `<div class="subtitle" style="margin-bottom: 16px;">${esc(subtitle)}</div>` : ''}
  <div style="flex: 1;"></div>
  ${meterHtml}
  <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
    ${sponsorHtml}
    <span class="branding">absurdityindex.org</span>
  </div>
</div>`;

  return wrapHtml(body);
}

// ── Rules OG Template ─────────────────────────────────────────────
function renderRulesHtml(data) {
  const { title, resolution, chamber, congressNumber, congressYears, votes } = data;

  const chamberLabel = chamber === 'house' ? 'House' : 'Senate';
  const chamberClass = chamber === 'house' ? 'chamber-house' : 'chamber-senate';

  // Vote boxes
  let voteHtml = '';
  if (votes) {
    voteHtml = `
    <div style="display: flex; gap: 12px; margin-top: 8px;">
      <span class="vote-box vote-yea">YEA ${votes.yeas || 0}</span>
      <span class="vote-box vote-nay">NAY ${votes.nays || 0}</span>
      ${votes.passed ? '<span style="font-size: 13px; color: #4ade80; font-weight: 600; align-self: center;">ADOPTED</span>' : ''}
    </div>`;
  }

  const body = `
<div class="content">
  <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px; flex-wrap: wrap;">
    <span class="chamber-badge ${chamberClass}">${chamberLabel}</span>
    <span class="bill-number">${esc(resolution)}</span>
    <span class="category-tag">${congressNumber}th Congress</span>
    ${congressYears ? `<span style="font-size: 14px; color: rgba(245,240,232,0.4);">${esc(congressYears)}</span>` : ''}
  </div>
  <div class="title" style="margin-bottom: 12px;">${chamberLabel} Rules Package</div>
  <div class="subtitle">${esc(title)}</div>
  <div style="flex: 1;"></div>
  ${voteHtml}
  <div style="display: flex; align-items: center; justify-content: flex-end; margin-top: 16px;">
    <span class="branding">absurdityindex.org</span>
  </div>
</div>`;

  return wrapHtml(body);
}

// ── Static Page OG Template ───────────────────────────────────────
function renderStaticHtml({ title, tagline }) {
  const body = `
<div class="content" style="align-items: center; justify-content: center; text-align: center;">
  <div style="margin-bottom: 32px;">
    ${sealSvg(120)}
  </div>
  <div class="title" style="font-size: 52px; text-align: center; margin-bottom: 16px; -webkit-line-clamp: 2;">${esc(title)}</div>
  ${tagline ? `<div class="subtitle" style="font-size: 24px; text-align: center;">${esc(tagline)}</div>` : ''}
  <div style="flex: 1;"></div>
  <span class="branding" style="font-size: 15px;">absurdityindex.org</span>
</div>`;

  return wrapHtml(body);
}

// ── Image Generator ───────────────────────────────────────────────
async function generateImage(page, html, outputPath) {
  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Small extra wait for font rendering to stabilize
  await page.waitForTimeout(100);
  await page.screenshot({ path: outputPath, type: 'png' });
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}${c.cyan}OG Image Generator${c.reset}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  let generated = 0;
  let skipped = 0;

  // ── Bills ─────────────────────────────────────────────────────
  if (ALL || BILLS_ONLY) {
    console.log(`${c.bold}Bills${c.reset}`);
    const files = fs.readdirSync(BILLS_DIR).filter((f) => f.endsWith('.mdx') && !f.startsWith('_'));

    for (const file of files) {
      const id = file.replace(/\.mdx$/, '');
      const data = parseFrontmatter(path.join(BILLS_DIR, file));
      if (!data) {
        console.log(`  ${c.yellow}SKIP${c.reset} ${file} (no frontmatter)`);
        skipped++;
        continue;
      }

      const subdir = data.billType === 'real' ? 'bills' : 'not-bills';
      const outputPath = path.join(OG_DIR, subdir, `${id}.png`);

      if (!FORCE && fs.existsSync(outputPath)) {
        skipped++;
        continue;
      }

      const html = renderBillHtml(data);
      await generateImage(page, html, outputPath);
      console.log(`  ${c.green}OK${c.reset} ${subdir}/${id}.png`);
      generated++;
    }
  }

  // ── Rules ─────────────────────────────────────────────────────
  if (ALL || RULES_ONLY) {
    console.log(`${c.bold}Rules${c.reset}`);
    const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.mdx'));

    for (const file of files) {
      const id = file.replace(/\.mdx$/, '');
      const data = parseFrontmatter(path.join(RULES_DIR, file));
      if (!data) {
        console.log(`  ${c.yellow}SKIP${c.reset} ${file} (no frontmatter)`);
        skipped++;
        continue;
      }

      const outputPath = path.join(OG_DIR, 'rules', `${id}.png`);

      if (!FORCE && fs.existsSync(outputPath)) {
        skipped++;
        continue;
      }

      const html = renderRulesHtml(data);
      await generateImage(page, html, outputPath);
      console.log(`  ${c.green}OK${c.reset} rules/${id}.png`);
      generated++;
    }
  }

  // ── Static Pages ──────────────────────────────────────────────
  if (ALL || STATIC_ONLY) {
    console.log(`${c.bold}Static Pages${c.reset}`);

    for (const { slug, title, tagline } of STATIC_PAGES) {
      const outputPath = path.join(OG_DIR, `${slug}.png`);

      if (!FORCE && fs.existsSync(outputPath)) {
        skipped++;
        continue;
      }

      const html = renderStaticHtml({ title, tagline });
      await generateImage(page, html, outputPath);
      console.log(`  ${c.green}OK${c.reset} ${slug}.png`);
      generated++;
    }
  }

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n${c.bold}Done${c.reset}`);
  console.log(`  ${c.green}Generated:${c.reset} ${generated}`);
  if (skipped > 0) {
    console.log(`  ${c.dim}Skipped:${c.reset}   ${skipped} (already exist, use --force to regenerate)`);
  }
  console.log();
}

main().catch((err) => {
  console.error(`${c.red}Error:${c.reset}`, err);
  process.exit(1);
});
