// Extract bill info from the page URL
// URL format: https://www.congress.gov/bill/119th-congress/house-bill/25
const urlMatch = window.location.pathname.match(/\/bill\/(\d+)th-congress\/(house-bill|senate-bill)\/(\d+)/);

if (urlMatch) {
  const [, congress, type, number] = urlMatch;
  const billType = type === 'house-bill' ? 'hr' : 's';
  const billId = `real-${billType}-${number}`;

  // Fetch from Absurdity Index API
  fetch('https://absurdityindex.org/api/bills.json')
    .then(r => r.json())
    .then(data => {
      const bill = data.bills.find(b => b.id === billId);
      if (bill && bill.absurdityIndex) {
        injectBadge(bill);
      }
    })
    .catch(console.error);
}

function injectBadge(bill) {
  const badge = document.createElement('div');
  badge.className = 'absurdity-index-badge';
  badge.innerHTML = `
    <div class="ai-badge-header">
      <img src="${chrome.runtime.getURL('icon-48.png')}" alt="Absurdity Index" class="ai-badge-icon">
      <span class="ai-badge-title">Absurdity Index</span>
    </div>
    <div class="ai-badge-score">
      <span class="ai-badge-number">${bill.absurdityIndex}</span>
      <span class="ai-badge-max">/10</span>
    </div>
    <div class="ai-badge-label">${getLabel(bill.absurdityIndex)}</div>
    <a href="${bill.url}" target="_blank" class="ai-badge-link">View on Absurdity Index</a>
  `;

  // Insert after the bill title
  const titleEl = document.querySelector('h1.legDetail');
  if (titleEl) {
    titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
  }
}

function getLabel(score) {
  if (score <= 3) return 'Business as Usual';
  if (score <= 6) return 'Questionable';
  if (score <= 8) return 'Your Tax Dollars';
  return 'Fish on Meth';
}
