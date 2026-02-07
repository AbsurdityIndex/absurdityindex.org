import { chromium, type Browser } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

export type MemeTemplate = 'committee-memo' | 'navy-card';

export interface RenderMemeOptions {
  text: string;
  outPath: string;
  width?: number;
  height?: number;
  template?: MemeTemplate;
  stampText?: string | null;
  headless?: boolean;
}

// Brand colors from src/styles/global.css @theme (kept in sync manually)
const COLORS = {
  navy950: '#060F1E',
  navy900: '#0A1628',
  navy800: '#121F36',
  navy700: '#1A2D4D',
  navy600: '#2D5986',
  gold700: '#8A6E36',
  gold500: '#C5A572',
  gold400: '#D4BB8A',
  gold300: '#E8D5B0',
  cream50: '#FEFCF7',
  cream100: '#FAF7F0',
  cream200: '#F0EBE0',
  parchment: '#F5F0E1',
  red700: '#8B1A1A',
};

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

function buildCommitteeMemoHtml(params: { width: number; height: number }): string {
  const { width, height } = params;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
    <style>
      :root {
        --navy-950: ${COLORS.navy950};
        --navy-900: ${COLORS.navy900};
        --navy-800: ${COLORS.navy800};
        --navy-700: ${COLORS.navy700};
        --navy-600: ${COLORS.navy600};
        --gold-700: ${COLORS.gold700};
        --gold-500: ${COLORS.gold500};
        --gold-400: ${COLORS.gold400};
        --gold-300: ${COLORS.gold300};
        --cream-50: ${COLORS.cream50};
        --cream-100: ${COLORS.cream100};
        --cream-200: ${COLORS.cream200};
        --parchment: ${COLORS.parchment};
        --red-700: ${COLORS.red700};
        --font-serif: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
        --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
        --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      * { box-sizing: border-box; }

      html, body {
        width: ${width}px;
        height: ${height}px;
        margin: 0;
        padding: 0;
      }

      body {
        background: radial-gradient(1100px 700px at 20% 15%, var(--navy-700) 0%, var(--navy-900) 55%, var(--navy-950) 100%);
        font-family: var(--font-sans);
        overflow: hidden;
      }

      .frame {
        position: relative;
        width: 100%;
        height: 100%;
        padding: 46px;
      }

      .paper {
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 28px;
        background:
          linear-gradient(180deg, var(--cream-50) 0%, var(--parchment) 55%, var(--cream-200) 100%);
        border: 4px solid var(--gold-300);
        box-shadow: 0 28px 70px rgba(0,0,0,0.45);
        overflow: hidden;
        padding: 44px 52px;
        display: flex;
        flex-direction: column;
        gap: 26px;
      }

      /* subtle "ledger lines" effect */
      .paper::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          repeating-linear-gradient(
            180deg,
            rgba(10, 22, 40, 0.00) 0px,
            rgba(10, 22, 40, 0.00) 10px,
            rgba(10, 22, 40, 0.035) 11px
          );
        pointer-events: none;
        opacity: 0.55;
      }

      .watermark {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-serif);
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-size: 96px;
        color: var(--navy-900);
        opacity: 0.06;
        transform: rotate(-12deg);
        pointer-events: none;
        user-select: none;
      }

      .header {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .seal {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        background: var(--gold-500);
        color: var(--navy-900);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-serif);
        font-weight: 700;
        letter-spacing: 0.08em;
      }

      .brand-lines {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .brand-title {
        font-family: var(--font-serif);
        font-size: 18px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--navy-800);
      }

      .brand-subtitle {
        font-family: var(--font-mono);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--navy-600);
      }

      .meta {
        font-family: var(--font-mono);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--navy-600);
        text-align: right;
        margin-top: 4px;
        white-space: nowrap;
      }

      .rule {
        position: relative;
        height: 2px;
        background: linear-gradient(90deg, var(--gold-400), rgba(0,0,0,0));
        border-radius: 2px;
      }

      .content {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
      }

      .text-wrap {
        width: 100%;
        max-width: 980px;
        height: 100%;
        max-height: 360px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .meme-text {
        width: 100%;
        font-family: var(--font-serif);
        font-weight: 700;
        font-size: 72px;
        line-height: 1.08;
        color: var(--navy-900);
        text-align: center;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        hyphens: auto;
        padding: 0 8px;
      }

      .footer {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 18px;
        border-top: 1px solid var(--gold-300);
        gap: 18px;
      }

      .tag {
        font-family: var(--font-mono);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--gold-700);
      }

      .url {
        font-family: var(--font-mono);
        font-size: 13px;
        letter-spacing: 0.10em;
        color: var(--navy-700);
      }

      .stamp {
        position: absolute;
        right: 72px;
        top: 70px;
        transform: rotate(-12deg);
        font-family: var(--font-serif);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--red-700);
        border: 4px double currentColor;
        border-radius: 10px;
        padding: 12px 16px;
        opacity: 0.18;
        pointer-events: none;
        user-select: none;
        background: rgba(255,255,255,0.06);
        backdrop-filter: blur(1px);
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="paper">
        <div class="watermark">Absurdity Index</div>
        <div class="header">
          <div class="brand">
            <div class="seal">AI</div>
            <div class="brand-lines">
              <div class="brand-title">Absurdity Index</div>
              <div class="brand-subtitle">Public Satire Memorandum</div>
            </div>
          </div>
          <div class="meta">
            Filed: <span id="memeDate">0000-00-00</span>
          </div>
        </div>
        <div class="rule"></div>
        <div class="content">
          <div class="text-wrap" id="memeTextWrap">
            <div class="meme-text" id="memeText"></div>
          </div>
        </div>
        <div class="footer">
          <div class="tag">For Entertainment Purposes Only</div>
          <div class="url">absurdityindex.org</div>
        </div>
      </div>

      <div class="stamp" id="memeStamp">UNDER CONSIDERATION</div>
    </div>
  </body>
</html>`;
}

function buildNavyCardHtml(params: { width: number; height: number }): string {
  const { width, height } = params;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Libre+Caslon+Text:wght@400;700&display=swap" rel="stylesheet" />
    <style>
      :root {
        --navy-900: ${COLORS.navy900};
        --navy-800: ${COLORS.navy800};
        --navy-700: ${COLORS.navy700};
        --gold-500: ${COLORS.gold500};
        --gold-400: ${COLORS.gold400};
        --cream-50: ${COLORS.cream50};
        --font-serif: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
        --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      }

      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; }

      body {
        background: var(--navy-900);
        font-family: var(--font-sans);
        color: var(--cream-50);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 56px 72px;
        text-align: center;
        overflow: hidden;
      }

      .seal {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        background: var(--gold-500);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        font-weight: 700;
        color: var(--navy-900);
        margin-bottom: 28px;
        font-family: var(--font-serif);
        letter-spacing: 0.08em;
      }

      .headline-wrap {
        width: 100%;
        max-width: 980px;
        max-height: 320px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto;
      }

      .headline {
        font-family: var(--font-serif);
        font-size: 64px;
        font-weight: 700;
        line-height: 1.18;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        hyphens: auto;
      }

      .divider {
        width: 86px;
        height: 3px;
        background: var(--gold-500);
        border-radius: 2px;
        margin: 32px 0 20px;
      }

      .site-url {
        font-size: 18px;
        color: var(--gold-400);
        letter-spacing: 0.10em;
      }
    </style>
  </head>
  <body>
    <div class="seal">AI</div>
    <div class="headline-wrap" id="memeTextWrap">
      <div class="headline" id="memeText"></div>
    </div>
    <div class="divider"></div>
    <div class="site-url">absurdityindex.org</div>
  </body>
</html>`;
}

function resolveTemplate(template: MemeTemplate): (params: { width: number; height: number }) => string {
  if (template === 'navy-card') return buildNavyCardHtml;
  return buildCommitteeMemoHtml;
}

export async function renderMemePng(options: RenderMemeOptions): Promise<void> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const template = options.template ?? 'committee-memo';
  const stampText = options.stampText === undefined ? 'UNDER CONSIDERATION' : options.stampText;
  const headless = options.headless ?? true;

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });

  const html = resolveTemplate(template)({ width, height });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless });
    const page = await browser.newPage({ viewport: { width, height } });

    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Best-effort font load (if available). If fonts cannot load, rendering still works with fallbacks.
    await page.evaluate(() => {
      const d = (globalThis as any).document;
      return d?.fonts?.ready ?? Promise.resolve();
    });

    await page.evaluate(
      ({ text, stampText: stamp }) => {
        const d = (globalThis as any).document;
        const textEl = d?.getElementById?.('memeText');
        if (textEl) textEl.textContent = text;

        const dateEl = d?.getElementById?.('memeDate');
        if (dateEl) {
          const d = new Date();
          // YYYY-MM-DD
          const yyyy = String(d.getFullYear());
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          dateEl.textContent = `${yyyy}-${mm}-${dd}`;
        }

        const stampEl = d?.getElementById?.('memeStamp');
        if (stampEl) {
          if (stamp) {
            stampEl.textContent = stamp;
            stampEl.style.display = 'block';
          } else {
            stampEl.style.display = 'none';
          }
        }

        // Fit-to-box: shrink font until it fits in the wrapper.
        const wrap = d?.getElementById?.('memeTextWrap');
        if (!wrap || !textEl) return;

        const maxFont = 76;
        const minFont = 26;
        const step = 2;

        let size = maxFont;
        textEl.style.fontSize = `${size}px`;

        // A few passes are enough; avoid infinite loops.
        for (let i = 0; i < 60; i++) {
          const fits = textEl.scrollHeight <= wrap.clientHeight && textEl.scrollWidth <= wrap.clientWidth;
          if (fits) break;

          size -= step;
          if (size <= minFont) {
            size = minFont;
            textEl.style.fontSize = `${size}px`;
            break;
          }
          textEl.style.fontSize = `${size}px`;
        }
      },
      { text: options.text, stampText },
    );

    await page.screenshot({ path: options.outPath, type: 'png' });
    await page.close();
  } finally {
    await browser?.close();
  }

  log.info({ outPath: options.outPath, template, width, height }, 'Meme rendered');
}
