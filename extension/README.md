# Absurdity Index Browser Extension

A browser extension that displays Absurdity Index scores while browsing bills on Congress.gov.

## Features

- Automatically shows Absurdity Index scores on Congress.gov bill pages
- Click the extension icon to see overall stats
- Works on Chrome (Manifest V3) and Firefox

## Installation

### Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select this `extension` folder
5. The Absurdity Index icon should appear in your toolbar

### Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file in this folder
5. The extension will be loaded (note: temporary add-ons are removed when Firefox closes)

For permanent Firefox installation, the extension would need to be signed and published on addons.mozilla.org.

## Setup: Icons

Icon files are now included in this folder:

- `icon-48.png`
- `icon-128.png`

If you want to regenerate them, run `npm run icons:generate` from the repo root.

## How It Works

When you visit a bill page on Congress.gov (e.g., `https://www.congress.gov/bill/119th-congress/house-bill/25`), the extension:

1. Extracts the bill number from the URL
2. Fetches data from the Absurdity Index API
3. If the bill is indexed, displays a badge with the Absurdity Score

## Development

The extension consists of:

- `manifest.json` - Extension configuration (Manifest V3)
- `content.js` - Injected into Congress.gov bill pages
- `styles.css` - Badge styling
- `popup.html` / `popup.js` - Extension popup UI

### API Endpoints

The extension fetches data from:

- `https://absurdityindex.org/api/bills/{bill-id}.json` - Single-bill data (primary)
- `https://absurdityindex.org/api/bills.json` - Full bill list (fallback for older deployments)
- `https://absurdityindex.org/api/stats.json` - Overall statistics

## Firefox Compatibility

This extension uses Manifest V3 which is supported by both Chrome and Firefox. The content script uses runtime API detection (`browser` when available, otherwise `chrome`) for icon URL resolution.

## License

Part of the Absurdity Index project.
