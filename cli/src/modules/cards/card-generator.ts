import { chromium, type Browser } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

export interface CardOptions {
  /** Bill-specific fields (optional) */
  bill?: {
    billNumber: string;
    title: string;
    absurdityIndex?: number;
    totalPork?: number;
  };
  /** For non-bill posts, a headline */
  headline?: string;
}

export interface CardResult {
  filePath: string;
  cleanup: () => void;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 675;

// Brand colors from global.css @theme
const COLORS = {
  navy900: '#0A1628',
  navy800: '#121F36',
  navy700: '#1A2D4D',
  gold500: '#C5A572',
  gold400: '#D4BB8A',
  gold300: '#E8D5B0',
  cream50: '#FEFCF7',
  cream100: '#FAF7F0',
  red500: '#C02828',
  green600: '#228B4A',
};

function absurdityColor(score: number): string {
  if (score >= 8) return COLORS.red500;
  if (score >= 5) return COLORS.gold500;
  return COLORS.green600;
}

function buildBillCardHtml(bill: NonNullable<CardOptions['bill']>): string {
  const gaugeColor = bill.absurdityIndex != null ? absurdityColor(bill.absurdityIndex) : COLORS.gold500;
  const gaugeWidth = bill.absurdityIndex != null ? `${bill.absurdityIndex * 10}%` : '0%';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Libre+Caslon+Text:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${CARD_WIDTH}px;
      height: ${CARD_HEIGHT}px;
      background: ${COLORS.navy900};
      font-family: 'Inter', sans-serif;
      color: ${COLORS.cream50};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px 56px;
      overflow: hidden;
    }
    .top-bar {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .top-bar .seal {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${COLORS.gold500};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      color: ${COLORS.navy900};
    }
    .top-bar .brand {
      font-family: 'Libre Caslon Text', serif;
      font-size: 18px;
      color: ${COLORS.gold400};
      letter-spacing: 1px;
    }
    .bill-number {
      font-size: 22px;
      font-weight: 600;
      color: ${COLORS.gold500};
      margin-top: 24px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .bill-title {
      font-family: 'Libre Caslon Text', serif;
      font-size: 38px;
      font-weight: 700;
      line-height: 1.2;
      margin-top: 16px;
      max-height: 180px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .stats {
      display: flex;
      gap: 40px;
      margin-top: auto;
    }
    .stat-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .stat-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: ${COLORS.gold400};
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
    }
    .gauge-track {
      width: 200px;
      height: 8px;
      background: ${COLORS.navy700};
      border-radius: 4px;
      margin-top: 4px;
    }
    .gauge-fill {
      height: 100%;
      border-radius: 4px;
      background: ${gaugeColor};
      width: ${gaugeWidth};
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid ${COLORS.navy700};
      padding-top: 20px;
      margin-top: 24px;
    }
    .site-url {
      font-size: 16px;
      color: ${COLORS.gold400};
      letter-spacing: 1px;
    }
    .divider {
      width: 60px;
      height: 3px;
      background: ${COLORS.gold500};
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div>
    <div class="top-bar">
      <div class="seal">AI</div>
      <div class="brand">ABSURDITY INDEX</div>
    </div>
    <div class="bill-number">${escapeHtml(bill.billNumber)}</div>
    <div class="bill-title">${escapeHtml(bill.title)}</div>
  </div>
  <div>
    <div class="stats">
      ${bill.absurdityIndex != null ? `
      <div class="stat-block">
        <div class="stat-label">Absurdity Index</div>
        <div class="stat-value">${bill.absurdityIndex}/10</div>
        <div class="gauge-track"><div class="gauge-fill"></div></div>
      </div>` : ''}
      ${bill.totalPork != null ? `
      <div class="stat-block">
        <div class="stat-label">Pork Spending</div>
        <div class="stat-value">$${formatCompact(bill.totalPork)}</div>
      </div>` : ''}
    </div>
    <div class="footer">
      <div class="divider"></div>
      <div class="site-url">absurdityindex.org</div>
    </div>
  </div>
</body>
</html>`;
}

function buildGenericCardHtml(headline: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Libre+Caslon+Text:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${CARD_WIDTH}px;
      height: ${CARD_HEIGHT}px;
      background: ${COLORS.navy900};
      font-family: 'Inter', sans-serif;
      color: ${COLORS.cream50};
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 48px 72px;
      text-align: center;
      overflow: hidden;
    }
    .seal {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${COLORS.gold500};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      color: ${COLORS.navy900};
      margin-bottom: 28px;
    }
    .headline {
      font-family: 'Libre Caslon Text', serif;
      font-size: 44px;
      font-weight: 700;
      line-height: 1.25;
      max-height: 280px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }
    .divider {
      width: 80px;
      height: 3px;
      background: ${COLORS.gold500};
      border-radius: 2px;
      margin: 32px 0 20px;
    }
    .site-url {
      font-size: 18px;
      color: ${COLORS.gold400};
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="seal">AI</div>
  <div class="headline">${escapeHtml(headline)}</div>
  <div class="divider"></div>
  <div class="site-url">absurdityindex.org</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

/**
 * Generate a branded image card using Playwright.
 * Returns a temp PNG path + cleanup function.
 */
export async function generateCard(options: CardOptions): Promise<CardResult> {
  const html = options.bill
    ? buildBillCardHtml(options.bill)
    : buildGenericCardHtml(options.headline ?? 'Absurdity Index');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-card-'));
  const filePath = path.join(tmpDir, 'card.png');

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
    });

    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.screenshot({ path: filePath, type: 'png' });
    await page.close();
  } finally {
    await browser?.close();
  }

  log.info({ filePath }, 'Card generated');

  return {
    filePath,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}
