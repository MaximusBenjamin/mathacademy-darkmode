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
      streak: true, longest: true, avg: true,
      max: true, month: true, bestMonth: true,
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
