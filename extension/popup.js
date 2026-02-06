function formatNumber(value, fallback = 'N/A') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (Number.isInteger(parsed)) return String(parsed);
  return parsed.toFixed(1);
}

function renderStat(container, labelText, valueText) {
  const row = document.createElement('div');
  row.className = 'stat';

  const label = document.createElement('span');
  label.textContent = labelText;

  const value = document.createElement('span');
  value.className = 'stat-value';
  value.textContent = valueText;

  row.appendChild(label);
  row.appendChild(value);
  container.appendChild(row);
}

fetch('https://absurdityindex.org/api/stats.json')
  .then((response) => response.json())
  .then((data) => {
    const statsContainer = document.getElementById('stats');
    if (!statsContainer) return;

    statsContainer.textContent = '';

    const totalBills = data.totalBills ?? data.totals?.all;
    const realBills = data.realBills ?? data.totals?.real;
    const averageAbsurdity = data.averageAbsurdity ?? data.absurdity?.average;

    renderStat(statsContainer, 'Bills Indexed', formatNumber(totalBills, '0'));
    renderStat(statsContainer, 'Real Bills', formatNumber(realBills, '0'));
    renderStat(statsContainer, 'Avg Absurdity', `${formatNumber(averageAbsurdity, '0.0')}/10`);
  })
  .catch(() => {
    const statsContainer = document.getElementById('stats');
    if (!statsContainer) return;
    statsContainer.textContent = 'Could not load stats';
  });
