# Absurdity Index Browser Extension

Chrome/Firefox extension that displays Absurdity Index scores on Congress.gov bill pages.

## Tech Stack

- **Vanilla JavaScript** — no build step, no bundler
- **Manifest V3** (Chrome + Firefox compatible)
- **Permissions:** `activeTab` only, host limited to `https://www.congress.gov/*`

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `content.js` | Content script injected into Congress.gov bill pages |
| `styles.css` | Badge and overlay styling |
| `popup.html` | Extension popup UI |
| `popup.js` | Popup logic — fetches stats from API |
| `icon-48.png` / `icon-128.png` | Extension icons |

## How It Works

1. Content script activates on `https://www.congress.gov/bill/*` URLs
2. Extracts bill number from the URL
3. Fetches data from `https://absurdityindex.org/api/bills/{bill-id}.json`
4. Displays a badge with the Absurdity Score if the bill is indexed

## API Endpoints Used

- `https://absurdityindex.org/api/bills/{bill-id}.json` — single bill data (primary)
- `https://absurdityindex.org/api/bills.json` — full bill list (fallback)
- `https://absurdityindex.org/api/stats.json` — overall statistics

## Development

Load unpacked in Chrome:
1. Go to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" and select this `extension/` folder

No build step needed — edit files and reload the extension.

## Conventions

- Uses `browser` API when available (Firefox), falls back to `chrome` API
- Icons are exported from `/public/favicon.svg` at 48px and 128px
