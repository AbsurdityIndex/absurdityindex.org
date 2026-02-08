// Extract bill info from the page URL
// URL format: https://www.congress.gov/bill/119th-congress/house-bill/25
const urlMatch = globalThis.location.pathname.match(/\/bill\/(\d+)th-congress\/(house-bill|senate-bill)\/(\d+)/);

function detectRuntimeApi() {
  if (typeof browser !== 'undefined') return browser;
  if (typeof chrome !== 'undefined') return chrome;
  return null;
}
const runtimeApi = detectRuntimeApi();

if (urlMatch) {
  const [, congress, type, number] = urlMatch;
  const billType = type === 'house-bill' ? 'hr' : 's';
  const candidateBillIds = [
    `real-${billType}-${number}-${congress}`,
    `real-${billType}-${number}`,
  ];
  const legacyEndpoint = 'https://absurdityindex.org/api/bills.json';

  async function loadBill() {
    try {
      const bill = await fetchBillFromCandidateEndpoints(candidateBillIds);
      if (bill && hasAbsurdityScore(bill.absurdityIndex)) {
        injectBadge(bill);
      }
    } catch {
      // Fallback for older deployments without per-bill endpoint
      try {
        const response = await fetch(legacyEndpoint);
        const data = await response.json();
        const bills = Array.isArray(data?.bills) ? data.bills : [];
        const bill = bills.find((entry) => candidateBillIds.includes(entry.id));
        if (bill && hasAbsurdityScore(bill.absurdityIndex)) {
          injectBadge(bill);
        }
      } catch (error_) {
        console.error(error_);
      }
    }
  }
  loadBill().catch(console.error); // NOSONAR — content scripts can't use top-level await (not ES modules)
}

async function fetchBillFromCandidateEndpoints(candidateBillIds) {
  for (const billId of candidateBillIds) {
    const billEndpoint = `https://absurdityindex.org/api/bills/${billId}.json`;
    try {
      const response = await fetch(billEndpoint);
      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const bill = data.bill;
      if (bill) {
        return bill;
      }
    } catch {
      // Expected when endpoint doesn't exist for this bill ID — try next candidate.
    }
  }

  throw new Error('No matching bill endpoint found');
}

function hasAbsurdityScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0;
}

function injectBadge(bill) {
  const badge = document.createElement('div');
  badge.className = 'absurdity-index-badge';

  const header = document.createElement('div');
  header.className = 'ai-badge-header';

  const icon = document.createElement('img');
  icon.alt = 'Absurdity Index';
  icon.className = 'ai-badge-icon';
  icon.src = runtimeApi?.runtime?.getURL('icon-48.png') ?? '';
  header.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'ai-badge-title';
  title.textContent = 'Absurdity Index';
  header.appendChild(title);

  const scoreWrap = document.createElement('div');
  scoreWrap.className = 'ai-badge-score';

  const scoreNumber = document.createElement('span');
  scoreNumber.className = 'ai-badge-number';
  const scoreValue = toSafeScore(bill.absurdityIndex);
  scoreNumber.textContent = scoreValue === null ? '?' : String(scoreValue);
  scoreWrap.appendChild(scoreNumber);

  const scoreMax = document.createElement('span');
  scoreMax.className = 'ai-badge-max';
  scoreMax.textContent = '/10';
  scoreWrap.appendChild(scoreMax);

  const label = document.createElement('div');
  label.className = 'ai-badge-label';
  label.textContent = getLabel(scoreValue ?? 0);

  const link = document.createElement('a');
  link.className = 'ai-badge-link';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.href = safeUrl(bill.url);
  link.textContent = 'View on Absurdity Index';

  badge.appendChild(header);
  badge.appendChild(scoreWrap);
  badge.appendChild(label);
  badge.appendChild(link);

  // Insert after the bill title
  const titleEl = document.querySelector('h1.legDetail');
  if (titleEl) {
    titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
  }
}

function toSafeScore(score) {
  const parsed = Number(score);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(10, parsed));
  }
  return null;
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Invalid URL — fall through to inert '#' value.
  }

  return '#';
}

// Keep in sync with src/utils/absurdity-tiers.ts
function getLabel(score) {
  if (score <= 3) return 'Suspiciously Reasonable';
  if (score <= 6) return 'Pork-Adjacent';
  if (score <= 8) return 'Hold My Gavel';
  return 'Fish on Meth';
}
