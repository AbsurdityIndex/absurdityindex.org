fetch('https://absurdityindex.org/api/stats.json')
  .then(r => r.json())
  .then(data => {
    document.getElementById('stats').innerHTML = `
      <div class="stat">
        <span>Bills Indexed</span>
        <span class="stat-value">${data.totalBills}</span>
      </div>
      <div class="stat">
        <span>Real Bills</span>
        <span class="stat-value">${data.realBills}</span>
      </div>
      <div class="stat">
        <span>Avg Absurdity</span>
        <span class="stat-value">${data.averageAbsurdity}/10</span>
      </div>
    `;
  })
  .catch(() => {
    document.getElementById('stats').innerHTML = '<p>Could not load stats</p>';
  });
