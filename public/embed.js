(function () {
  'use strict';

  var script = document.currentScript;
  var billId = script.getAttribute('data-bill');
  var theme = script.getAttribute('data-theme') || 'light';
  var container = document.createElement('div');
  container.className = 'absurdity-index-embed';

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
    container.innerHTML =
      '<p style="color: #DC2626; font-family: sans-serif; font-size: 14px;">Error: data-bill attribute is required</p>';
    script.parentNode.insertBefore(container, script);
    return;
  }

  // Show loading state
  container.innerHTML =
    '<p style="color: ' +
    colors.textSecondary +
    '; font-family: sans-serif; font-size: 14px;">Loading bill...</p>';
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
        container.innerHTML =
          '<p style="color: #DC2626; font-family: sans-serif; font-size: 14px;">Bill not found: ' +
          billId +
          '</p>';
        return;
      }

      var absurdityBadge = '';
      if (bill.absurdityIndex) {
        absurdityBadge =
          '<span style="background: ' +
          colors.accent +
          '; color: ' +
          colors.text +
          '; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: sans-serif;">Absurdity: ' +
          bill.absurdityIndex +
          '/10</span>';
      }

      var billTypeBadge = '';
      if (bill.billType !== 'real') {
        var typeLabel = bill.billType === 'sensible' ? 'Sensible' : 'Satirical';
        billTypeBadge =
          '<span style="background: ' +
          (bill.billType === 'sensible' ? '#228B4A' : '#A52020') +
          '; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: sans-serif; margin-left: 4px;">' +
          typeLabel +
          '</span>';
      }

      container.innerHTML =
        '<div style="' +
        'font-family: ' +
        baseStyles.fontFamily +
        '; ' +
        'border: 2px solid ' +
        colors.border +
        '; ' +
        'border-radius: ' +
        baseStyles.borderRadius +
        '; ' +
        'padding: ' +
        baseStyles.padding +
        '; ' +
        'background: ' +
        colors.background +
        '; ' +
        'max-width: ' +
        baseStyles.maxWidth +
        '; ' +
        'box-sizing: border-box;' +
        '">' +
        '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">' +
        '<span style="font-family: monospace; font-weight: bold; color: ' +
        colors.text +
        ';">' +
        bill.billNumber +
        '</span>' +
        absurdityBadge +
        billTypeBadge +
        '</div>' +
        '<h3 style="margin: 0 0 8px 0; font-size: 18px; color: ' +
        colors.text +
        '; font-weight: bold;">' +
        bill.title +
        '</h3>' +
        '<p style="margin: 0 0 12px 0; font-size: 14px; color: ' +
        colors.textSecondary +
        '; line-height: 1.5;">' +
        bill.summary +
        '</p>' +
        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
        '<a href="' +
        bill.url +
        '" target="_blank" rel="noopener" style="color: ' +
        colors.accent +
        '; font-size: 12px; text-decoration: none; font-family: sans-serif;">View on Absurdity Index &rarr;</a>' +
        '<span style="font-size: 10px; color: ' +
        colors.textSecondary +
        '; font-family: sans-serif;">absurdityindex.org</span>' +
        '</div>' +
        '</div>';
    })
    .catch(function () {
      container.innerHTML =
        '<p style="color: #DC2626; font-family: sans-serif; font-size: 14px;">Error loading bill data</p>';
    });
})();
