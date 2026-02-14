#!/usr/bin/env node
/**
 * Submit URLs to IndexNow (Bing, Yandex, and partners).
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs              # submit key pages
 *   node scripts/submit-indexnow.mjs --all        # submit all sitemap URLs
 *   node scripts/submit-indexnow.mjs /bills/hr-1  # submit a single URL
 */

const SITE = 'https://absurdityindex.org';
const KEY = 'abc540d737cd4b59a2cdb71662b2736e';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// High-priority pages to always submit
const KEY_PAGES = [
  '/',
  '/bills/',
  '/not-bills/',
  '/about/',
  '/how-we-score/',
  '/quiz/',
  '/compare/',
  '/today/',
  '/search/',
  '/feed.xml',
];

async function fetchSitemapUrls() {
  const res = await fetch(`${SITE}/sitemap-index.xml`);
  const indexXml = await res.text();

  // Extract sitemap URLs from index
  const sitemapUrls = [...indexXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

  const allUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const sitemapRes = await fetch(sitemapUrl);
    const sitemapXml = await sitemapRes.text();
    const urls = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
    allUrls.push(...urls);
  }
  return allUrls;
}

async function submitUrls(urls) {
  const body = {
    host: 'absurdityindex.org',
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  console.log(`Submitting ${urls.length} URL(s) to IndexNow...`);

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  if (res.ok || res.status === 202) {
    console.log(`Success (${res.status}): URLs accepted for indexing.`);
  } else {
    const text = await res.text();
    console.error(`Error (${res.status}): ${text}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  let urls;

  if (args.includes('--all')) {
    console.log('Fetching all URLs from sitemap...');
    urls = await fetchSitemapUrls();
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    // Single URL path provided
    const path = args[0].startsWith('/') ? args[0] : `/${args[0]}`;
    urls = [`${SITE}${path}`];
  } else {
    // Default: key pages only
    urls = KEY_PAGES.map(p => `${SITE}${p}`);
  }

  console.log(`URLs to submit:\n${urls.map(u => `  ${u}`).join('\n')}\n`);
  await submitUrls(urls);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
