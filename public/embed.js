(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || !script.parentNode) {
    return;
  }
  var billId = script.getAttribute('data-bill');
  var theme = script.getAttribute('data-theme') || 'light';
  var container = document.createElement('div');
  container.className = 'absurdity-index-embed';

  function setMessage(text, opts) {
    container.replaceChildren();
    var p = document.createElement('p');
    p.textContent = text;
    p.style.color = (opts && opts.color) || '#334155';
    p.style.fontFamily = 'sans-serif';
    p.style.fontSize = '14px';
    container.appendChild(p);
  }

  function safeUrl(value) {
    try {
      var url = String(value == null ? '' : value).trim();
      if (!url) return '#';

      var parsed = new URL(url, 'https://absurdityindex.org');
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (_error) {
      // Fall through to inert URL.
    }

    return '#';
  }

  // Base styles
  var baseStyles = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    borderRadius: '8px',
    padding: '16px',
    maxWidth: '400px',
    boxSizing: 'border-box',
  };

  // Theme colors
  var themes = {
    light: {
      border: '#C5A572',
      background: '#F5F0E8',
      text: '#0A1628',
      textSecondary: '#334155',
      accent: '#C5A572',
    },
    dark: {
      border: '#C5A572',
      background: '#0A1628',
      text: '#F5F0E8',
      textSecondary: '#94a3b8',
      accent: '#D4BB8A',
    },
  };

  var colors = themes[theme] || themes.light;

  if (!billId) {
    setMessage('Error: data-bill attribute is required', { color: '#DC2626' });
    script.parentNode.insertBefore(container, script);
    return;
  }

  // Show loading state
  setMessage('Loading bill...', { color: colors.textSecondary });
  script.parentNode.insertBefore(container, script);

  // Fetch bill data from API
  fetch('https://absurdityindex.org/api/bills.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch');
      return r.json();
    })
    .then(function (data) {
      var bill = data.bills.find(function (b) {
        return b.id === billId;
      });

      if (!bill) {
        setMessage('Bill not found: ' + billId, { color: '#DC2626' });
        return;
      }

      var safeBillUrl = safeUrl(bill.url);
      var absurdityValue = Number(bill.absurdityIndex);
      container.replaceChildren();

      var wrap = document.createElement('div');
      wrap.style.fontFamily = baseStyles.fontFamily;
      wrap.style.border = '2px solid ' + colors.border;
      wrap.style.borderRadius = baseStyles.borderRadius;
      wrap.style.padding = baseStyles.padding;
      wrap.style.background = colors.background;
      wrap.style.maxWidth = baseStyles.maxWidth;
      wrap.style.boxSizing = 'border-box';

      var topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.gap = '8px';
      topRow.style.marginBottom = '8px';
      topRow.style.flexWrap = 'wrap';

      var billNo = document.createElement('span');
      billNo.textContent = String(bill.billNumber || '');
      billNo.style.fontFamily = 'monospace';
      billNo.style.fontWeight = 'bold';
      billNo.style.color = colors.text;
      topRow.appendChild(billNo);

      if (Number.isFinite(absurdityValue) && absurdityValue > 0) {
        var absurdityBadge = document.createElement('span');
        absurdityBadge.textContent = 'Absurdity: ' + absurdityValue + '/10';
        absurdityBadge.style.background = colors.accent;
        absurdityBadge.style.color = colors.text;
        absurdityBadge.style.padding = '2px 8px';
        absurdityBadge.style.borderRadius = '4px';
        absurdityBadge.style.fontSize = '12px';
        absurdityBadge.style.fontFamily = 'sans-serif';
        topRow.appendChild(absurdityBadge);
      }

      if (bill.billType !== 'real') {
        var typeBadge = document.createElement('span');
        var typeLabel =
          bill.billType === 'sensible'
            ? 'Sensible'
            : bill.billType === 'absurd'
              ? 'Absurd'
              : 'Satirical';
        typeBadge.textContent = typeLabel;
        typeBadge.style.background = bill.billType === 'sensible' ? '#228B4A' : '#A52020';
        typeBadge.style.color = 'white';
        typeBadge.style.padding = '2px 8px';
        typeBadge.style.borderRadius = '4px';
        typeBadge.style.fontSize = '12px';
        typeBadge.style.fontFamily = 'sans-serif';
        typeBadge.style.marginLeft = '4px';
        topRow.appendChild(typeBadge);
      }

      var title = document.createElement('h3');
      title.textContent = String(bill.title || '');
      title.style.margin = '0 0 8px 0';
      title.style.fontSize = '18px';
      title.style.color = colors.text;
      title.style.fontWeight = 'bold';

      var summary = document.createElement('p');
      summary.textContent = String(bill.summary || '');
      summary.style.margin = '0 0 12px 0';
      summary.style.fontSize = '14px';
      summary.style.color = colors.textSecondary;
      summary.style.lineHeight = '1.5';

      var bottom = document.createElement('div');
      bottom.style.display = 'flex';
      bottom.style.justifyContent = 'space-between';
      bottom.style.alignItems = 'center';
      bottom.style.flexWrap = 'wrap';
      bottom.style.gap = '8px';

      var link = document.createElement('a');
      link.href = safeBillUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'View on Absurdity Index ->';
      link.style.color = colors.accent;
      link.style.fontSize = '12px';
      link.style.textDecoration = 'none';
      link.style.fontFamily = 'sans-serif';

      var site = document.createElement('span');
      site.textContent = 'absurdityindex.org';
      site.style.fontSize = '10px';
      site.style.color = colors.textSecondary;
      site.style.fontFamily = 'sans-serif';

      bottom.append(link, site);

      wrap.append(topRow, title, summary, bottom);
      container.appendChild(wrap);
    })
    .catch(function () {
      setMessage('Error loading bill data', { color: '#DC2626' });
    });
})();
