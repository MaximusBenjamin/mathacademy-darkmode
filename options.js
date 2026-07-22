// Options page: loads settings, saves each key immediately on change.
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

  // Last-known-good values, used to recover from blank/garbage number input.
  var current = Object.assign({}, DEFAULTS);

  var flashTimers = {};

  function flash(name, text) {
    var el = document.querySelector('[data-flash="' + name + '"]');
    if (!el) return;
    if (text) el.textContent = text;
    el.classList.add('show');
    clearTimeout(flashTimers[name]);
    flashTimers[name] = setTimeout(function () {
      el.classList.remove('show');
    }, 1200);
  }

  function save(key, value, flashName) {
    current[key] = value;
    var patch = {};
    patch[key] = value;
    chrome.storage.sync.set(patch, function () {
      flash(flashName || key, 'Saved');
    });
  }

  function bindCheckbox(key) {
    var el = document.getElementById(key);
    el.addEventListener('change', function () {
      save(key, el.checked);
    });
  }

  // Clamp the edited threshold so 1 <= low <= med <= high always holds, fixing
  // only the key the user touched; the corrected value is written back to the
  // input so they see what was actually saved.
  function bindThreshold(key) {
    var el = document.getElementById(key);
    el.addEventListener('change', function () {
      var v = parseInt(el.value, 10);
      if (!isFinite(v)) v = current[key];
      v = Math.max(1, v);
      if (key === 'mamThLow') v = Math.min(v, current.mamThMed);
      if (key === 'mamThMed') v = Math.min(Math.max(v, current.mamThLow), current.mamThHigh);
      if (key === 'mamThHigh') v = Math.max(v, current.mamThMed);
      el.value = v;
      save(key, v, 'thresholds');
    });
  }

  chrome.storage.sync.get(DEFAULTS, function (settings) {
    current = settings;

    document.getElementById('mamTheme').checked = settings.mamTheme;
    document.getElementById('mamHeatmap').checked = settings.mamHeatmap;
    document.getElementById('mamHideXpFrame').checked = settings.mamHideXpFrame;
    document.getElementById('mamStartDate').value = settings.mamStartDate;
    document.getElementById('mamThLow').value = settings.mamThLow;
    document.getElementById('mamThMed').value = settings.mamThMed;
    document.getElementById('mamThHigh').value = settings.mamThHigh;

    bindCheckbox('mamTheme');
    bindCheckbox('mamHeatmap');
    bindCheckbox('mamHideXpFrame');
    bindThreshold('mamThLow');
    bindThreshold('mamThMed');
    bindThreshold('mamThHigh');

    document.getElementById('mamStartDate').addEventListener('change', function () {
      save('mamStartDate', this.value); // '' when cleared — allowed
    });

    var statBoxes = document.querySelectorAll('.stats-grid input[data-stat]');
    var shown = Object.assign({}, DEFAULTS.mamStatsShown, settings.mamStatsShown);
    statBoxes.forEach(function (box) {
      box.checked = shown[box.dataset.stat] !== false;
      box.addEventListener('change', function () {
        shown[box.dataset.stat] = box.checked;
        save('mamStatsShown', shown);
      });
    });

    document.getElementById('clearCache').addEventListener('click', function () {
      chrome.storage.local.remove(['mamActivities', 'mamLastSync'], function () {
        flash('clearCache', 'Cleared');
      });
    });
  });
})();
