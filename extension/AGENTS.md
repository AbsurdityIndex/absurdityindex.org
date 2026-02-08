# AGENTS.md — Browser Extension

This file provides guidance to AI coding assistants working in the `extension/` directory.

## Overview

Chrome/Firefox browser extension that displays Absurdity Index scores while browsing bills on Congress.gov.

## Tech Stack

- **Vanilla JavaScript** — no build step, no bundler, no framework
- **Chrome Manifest V3** (also compatible with Firefox)
- **Permissions:** `activeTab` only; host restricted to `https://www.congress.gov/*`

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `content.js` | Content script injected into Congress.gov bill pages |
| `styles.css` | Badge and overlay styling |
| `popup.html` | Extension popup UI (shown on toolbar icon click) |
| `popup.js` | Popup logic — fetches and displays stats from API |
| `icon-48.png` | Toolbar icon (48px) |
| `icon-128.png` | Store/details icon (128px) |

## How It Works

1. Content script activates on `https://www.congress.gov/bill/*` URLs
2. Extracts bill number from the page URL
3. Fetches data from `https://absurdityindex.org/api/bills/{bill-id}.json`
4. If the bill is indexed, displays a floating badge with the Absurdity Score

## API Endpoints

The extension fetches from the production site:

- `https://absurdityindex.org/api/bills/{bill-id}.json` — single bill (primary)
- `https://absurdityindex.org/api/bills.json` — full bill list (fallback)
- `https://absurdityindex.org/api/stats.json` — overall statistics (for popup)

## Development

No build step. Load unpacked in Chrome:

1. Navigate to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" → select this `extension/` folder
4. Edit files, then click the reload button on the extension card

For Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`.

## Key Patterns

- Uses `browser` API when available (Firefox), falls back to `chrome` API for cross-browser compatibility
- Icons are exported from the site's `/public/favicon.svg` at 48px and 128px sizes
- Content script is declaratively registered in `manifest.json` (not programmatically injected)
- No external dependencies — everything is self-contained vanilla JS
