// Settings authority: runs at document_start, stamps <html> attributes and
// exposes window.__mamSettings for the other content scripts.
(function () {
  'use strict';

  var DEFAULTS = {
    mamTheme: true,
    mamHeatmap: true,
    mamStartDate: '',
    mamThLow: 1,
    mamThMed: 15,
    mamThHigh: 30,
    mamHideXpFrame: false,
    mamStatsShown: {
      streak: true, longest: true, avg: false, avgSession: true,
      max: false, month: true, bestMonth: false,
    },
  };

  function apply(settings) {
    var html = document.documentElement;
    if (settings.mamTheme) html.removeAttribute('data-mam-off');
    else html.setAttribute('data-mam-off', '');
    if (settings.mamHideXpFrame) html.setAttribute('data-mam-hide-xp', '');
    else html.removeAttribute('data-mam-hide-xp');
    window.__mamSettings = settings;
    document.dispatchEvent(new CustomEvent('mam-settings', { detail: settings }));
  }

  // Inter is bundled with the extension; content-script CSS can't use relative
  // urls for extension resources, so the @font-face is injected here instead.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    var fontCss = document.createElement('style');
    fontCss.id = 'mam-fonts';
    fontCss.textContent =
      "@font-face { font-family: 'Inter'; font-weight: 100 900; font-style: normal;" +
      " src: url('" + chrome.runtime.getURL('fonts/inter.woff2') + "') format('woff2'); }";
    (document.head || document.documentElement).appendChild(fontCss);
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(DEFAULTS, apply);
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      chrome.storage.sync.get(DEFAULTS, apply);
    });
  } else {
    // Dev fallback (script injected into a bare page): defaults + localStorage override.
    var override = {};
    try { override = JSON.parse(localStorage.mamSettings || '{}'); } catch (e) {}
    apply(Object.assign({}, DEFAULTS, override));
  }
})();
