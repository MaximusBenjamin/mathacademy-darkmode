// Activity heatmap for mathacademy.com/learn.
// Data layer and grid design ported from MA Grid (https://github.com/thaske/ma-grid), MIT (c) 2025 thaske.
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
  };

  var DAY_MS = 24 * 60 * 60 * 1000;
  var THREE_YEARS_MS = 3 * 365 * DAY_MS;
  var MAX_PAGES = 200;
  var SLEEP_MS = 200;
  var ACT_KEY = 'mamActivities';
  var SYNC_KEY = 'mamLastSync';
  var STAT_LABELS = [
    'Current Streak', 'Longest Streak', 'Avg Daily XP',
    'Max Daily XP', 'This Month XP', 'Best Month XP',
  ];

  // ---------- storage (chrome.storage.local, localStorage fallback for dev injection) ----------

  var hasChromeLocal =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  var store = {
    get: function (key) {
      if (hasChromeLocal) {
        return new Promise(function (resolve) {
          chrome.storage.local.get(key, function (items) {
            resolve(items ? items[key] : undefined);
          });
        });
      }
      try {
        var raw = localStorage.getItem(key);
        return Promise.resolve(raw == null ? undefined : JSON.parse(raw));
      } catch (e) {
        return Promise.resolve(undefined);
      }
    },
    set: function (obj) {
      if (hasChromeLocal) {
        return new Promise(function (resolve) {
          chrome.storage.local.set(obj, resolve);
        });
      }
      try {
        Object.keys(obj).forEach(function (k) {
          localStorage.setItem(k, JSON.stringify(obj[k]));
        });
      } catch (e) { /* quota — nonfatal */ }
      return Promise.resolve();
    },
  };

  // ---------- settings ----------

  function settings() {
    var s = window.__mamSettings;
    if (!s) {
      // Dev injection into a bare page: defaults + localStorage.mamSettings JSON override.
      var override = {};
      try { override = JSON.parse(localStorage.mamSettings || '{}'); } catch (e) {}
      s = override;
    }
    return Object.assign({}, DEFAULTS, s);
  }

  // ---------- dates ----------

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Parse yyyy-mm-dd as a LOCAL date (new Date('yyyy-mm-dd') would be UTC).
  function parseKey(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function mondayOf(d) {
    var x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  // The API's 'completed' timestamps end with a bogus "Z" but are LOCAL time;
  // strip the Z so Date.parse interprets them as local. Cached values are epoch ms.
  function parseCompletedMs(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    var s = value.charAt(value.length - 1) === 'Z' ? value.slice(0, -1) : value;
    return Date.parse(s);
  }

  // ---------- data layer (ported from MA Grid) ----------

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Page backwards through /api/previous-tasks until we hit an already-cached
  // id (incremental sync), an empty page, the 3-year window, or the page cap.
  async function fetchNewActivities(cachedById) {
    var nowMs = Date.now();
    var windowStartMs = nowMs - THREE_YEARS_MS;
    var cursor = new Date(nowMs);
    var lastCursorMs = nowMs;
    var fresh = {};

    for (var page = 0; page < MAX_PAGES; page++) {
      var url = '/api/previous-tasks/' + encodeURIComponent(cursor.toString());
      var res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('previous-tasks request failed: ' + res.status);
      var items = await res.json();
      if (!Array.isArray(items)) throw new Error('previous-tasks: expected a JSON array');
      if (items.length === 0) break;

      var oldest = Infinity;
      var sawCached = false;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it) continue;
        var ms = parseCompletedMs(it.completed);
        if (isFinite(ms)) oldest = Math.min(oldest, ms);
        if (it.id == null) continue;
        if (cachedById[it.id]) {
          sawCached = true;
        } else if (isFinite(ms)) {
          fresh[it.id] = {
            id: it.id,
            pointsAwarded: Number(it.pointsAwarded) || 0,
            completed: ms,
          };
        }
      }

      if (sawCached) break;            // reached data from a previous sync
      if (!isFinite(oldest)) break;    // no parsable timestamps: cannot advance
      var nextMs = oldest - 1;
      if (nextMs <= windowStartMs) break;
      if (nextMs === lastCursorMs) break; // cursor stuck
      lastCursorMs = nextMs;
      cursor = new Date(nextMs);
      await sleep(SLEEP_MS);
    }

    return fresh;
  }

  async function sync() {
    var cached = (await store.get(ACT_KEY)) || {};
    var fresh = await fetchNewActivities(cached);
    var merged = Object.assign({}, cached, fresh);

    // Prune entries that fell out of the 3-year window (and any unparsable ones).
    var cutoff = Date.now() - THREE_YEARS_MS;
    Object.keys(merged).forEach(function (id) {
      var ms = parseCompletedMs(merged[id] && merged[id].completed);
      if (!isFinite(ms) || ms < cutoff) delete merged[id];
      else merged[id].completed = ms;
    });

    var toSave = {};
    toSave[ACT_KEY] = merged;
    toSave[SYNC_KEY] = Date.now();
    await store.set(toSave);
    return merged;
  }

  // ---------- aggregation ----------

  function levelFor(xp, s) {
    if (xp <= 0) return 0;
    if (xp >= Number(s.mamThHigh)) return 3;
    if (xp >= Number(s.mamThMed)) return 2;
    if (xp >= Number(s.mamThLow)) return 1;
    return 0;
  }

  function computeStats(daily, statsStart, today) {
    var totalXP = 0, maxXP = 0, dayCount = 0;
    var monthTotals = {};
    var longest = 0, run = 0;

    var d = new Date(statsStart);
    while (d <= today) {
      var key = dateKey(d);
      var xp = daily[key] || 0;
      totalXP += xp;
      if (xp > maxXP) maxXP = xp;
      dayCount++;
      var mk = key.slice(0, 7);
      monthTotals[mk] = (monthTotals[mk] || 0) + xp;
      if (xp > 0) { run++; if (run > longest) longest = run; } else { run = 0; }
      d.setDate(d.getDate() + 1);
    }

    var bestMonth = 0;
    Object.keys(monthTotals).forEach(function (mk2) {
      if (monthTotals[mk2] > bestMonth) bestMonth = monthTotals[mk2];
    });

    // Current streak: consecutive active days ending today, or ending yesterday
    // if today has no XP yet.
    var streak = 0;
    var check = new Date(today);
    if (!(daily[dateKey(check)] > 0)) check.setDate(check.getDate() - 1);
    while (check >= statsStart && daily[dateKey(check)] > 0) {
      streak++;
      check.setDate(check.getDate() - 1);
    }

    return {
      streak: streak,
      longest: longest,
      avg: dayCount > 0 ? Math.round(totalXP / dayCount) : 0, // mean over ALL days in range
      maxXP: maxXP,
      thisMonth: monthTotals[dateKey(today).slice(0, 7)] || 0,
      bestMonth: bestMonth,
    };
  }

  // ---------- DOM ----------

  var root = null;
  var els = null;
  var lastById = {};
  var refreshing = false;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildRoot() {
    root = el('div', 'mam-hm');
    root.id = 'mam-heatmap';

    var header = el('div', 'mam-hm__header');
    header.appendChild(el('div', 'mam-hm__title', 'Activity'));
    var btn = el('button', 'mam-hm__refresh', '↻');
    btn.type = 'button';
    btn.title = 'Refresh activity data';
    btn.addEventListener('click', function () { refresh(); });
    header.appendChild(btn);

    var stats = el('div', 'mam-hm__stats');
    var statValues = STAT_LABELS.map(function (label) {
      var stat = el('div', 'mam-hm__stat');
      var value = el('div', 'mam-hm__stat-value', '–');
      stat.appendChild(value);
      stat.appendChild(el('div', 'mam-hm__stat-label', label));
      stats.appendChild(stat);
      return value;
    });

    var wrap = el('div', 'mam-hm__wrap');
    var months = el('div', 'mam-hm__months');
    var grid = el('div', 'mam-hm__grid');
    var wdays = el('div', 'mam-hm__wdays');
    // Monday-first rows: Monday=1, Wednesday=3, Friday=5.
    [['M', 1], ['W', 3], ['F', 5]].forEach(function (pair) {
      var wd = el('div', 'mam-hm__wday', pair[0]);
      wd.style.gridRow = String(pair[1] + 1);
      wdays.appendChild(wd);
    });
    var days = el('div', 'mam-hm__days');
    grid.appendChild(wdays);
    grid.appendChild(days);
    wrap.appendChild(months);
    wrap.appendChild(grid);

    var footer = el('div', 'mam-hm__footer');
    var legend = el('div', 'mam-hm__legend');
    legend.appendChild(el('span', 'mam-hm__legend-text', 'Less'));
    for (var l = 0; l <= 3; l++) {
      legend.appendChild(el('div', 'mam-hm__cell mam-hm__cell--l' + l));
    }
    legend.appendChild(el('span', 'mam-hm__legend-text', 'More'));
    footer.appendChild(legend);

    var tooltip = el('div', 'mam-hm__tooltip');

    days.addEventListener('mouseover', function (e) {
      var cell = e.target && e.target.closest && e.target.closest('.mam-hm__cell');
      if (cell && days.contains(cell)) showTooltip(cell);
    });
    days.addEventListener('mouseout', function (e) {
      var cell = e.target && e.target.closest && e.target.closest('.mam-hm__cell');
      if (cell) hideTooltip();
    });

    root.appendChild(header);
    root.appendChild(stats);
    root.appendChild(wrap);
    root.appendChild(footer);
    root.appendChild(tooltip);

    els = { btn: btn, statValues: statValues, months: months, days: days, tooltip: tooltip };
  }

  function showTooltip(cell) {
    var tip = els.tooltip;
    var d = parseKey(cell.getAttribute('data-date'));
    var dateText = d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    tip.textContent = dateText + ' — ' + cell.getAttribute('data-xp') + ' XP';
    tip.style.display = 'block';

    var rootRect = root.getBoundingClientRect();
    var cellRect = cell.getBoundingClientRect();
    var left = cellRect.left - rootRect.left + cellRect.width / 2;
    var half = tip.offsetWidth / 2;
    left = Math.max(half + 4, Math.min(left, rootRect.width - half - 4));
    tip.style.left = left + 'px';
    tip.style.top = (cellRect.top - rootRect.top - 6) + 'px';
  }

  function hideTooltip() {
    if (els) els.tooltip.style.display = 'none';
  }

  function render() {
    if (!root || !els) return;
    var s = settings();
    var today = startOfDay(new Date());
    var todayKey = dateKey(today);

    var startDate = null;
    if (typeof s.mamStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.mamStartDate)) {
      startDate = parseKey(s.mamStartDate);
      if (startDate > today) startDate = null;
    }
    var startKey = startDate ? dateKey(startDate) : null;

    // Daily XP totals; days before mamStartDate (and any future-dated noise) are ignored.
    var daily = {};
    Object.keys(lastById).forEach(function (id) {
      var a = lastById[id];
      var ms = parseCompletedMs(a && a.completed);
      if (!isFinite(ms)) return;
      var key = dateKey(new Date(ms));
      if (startKey && key < startKey) return;
      if (key > todayKey) return;
      daily[key] = (daily[key] || 0) + (Number(a.pointsAwarded) || 0);
    });

    // Stats range: startDate onward, or first activity onward when unset.
    var statsStart;
    if (startDate) {
      statsStart = startDate;
    } else {
      var keys = Object.keys(daily).sort();
      statsStart = keys.length ? parseKey(keys[0]) : today;
    }

    // Grid range: Monday of startDate's week, or trailing ~12 months (53 columns).
    var gridStart = startDate
      ? mondayOf(startDate)
      : mondayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364));
    var totalDays = Math.round((today - gridStart) / DAY_MS) + 1;
    var cols = Math.floor((totalDays - 1) / 7) + 1;

    els.days.textContent = '';
    els.months.textContent = '';
    els.months.style.gridTemplateColumns = 'repeat(' + cols + ', 10px)';
    hideTooltip();

    var frag = document.createDocumentFragment();
    var d = new Date(gridStart);
    var lastMonth = -1;
    var lastLabel = null;
    var lastLabelCol = -1;

    for (var i = 0; i < totalDays; i++) {
      var col = Math.floor(i / 7);
      var row = i % 7; // gridStart is a Monday, so row 0 = Monday
      var key = dateKey(d);
      var xp = daily[key] || 0;

      var cell = el('div', 'mam-hm__cell mam-hm__cell--l' + levelFor(xp, s));
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(col + 1);
      cell.setAttribute('data-date', key);
      cell.setAttribute('data-xp', String(xp));
      frag.appendChild(cell);

      // Month labels over the column of each month's first Monday; drop the
      // previous label when a new one lands within 3 columns (collision).
      if (row === 0 && d.getMonth() !== lastMonth) {
        if (lastLabel && col - lastLabelCol < 3) els.months.removeChild(lastLabel);
        var label = el('div', 'mam-hm__month',
          d.toLocaleDateString('en-US', { month: 'short' }));
        label.style.gridRow = '1';
        label.style.gridColumn = String(col + 1);
        els.months.appendChild(label);
        lastMonth = d.getMonth();
        lastLabel = label;
        lastLabelCol = col;
      }

      d.setDate(d.getDate() + 1);
    }
    els.days.appendChild(frag);

    var st = computeStats(daily, statsStart, today);
    var v = els.statValues;
    v[0].textContent = String(st.streak);
    v[1].textContent = String(st.longest);
    v[2].textContent = String(st.avg);
    v[3].textContent = String(st.maxXP);
    v[4].textContent = String(st.thisMonth);
    v[5].textContent = String(st.bestMonth);
  }

  // ---------- sync + render ----------

  function refresh() {
    if (refreshing) return Promise.resolve();
    refreshing = true;
    if (els) {
      els.btn.disabled = true;
      els.btn.classList.add('mam-hm__refresh--busy');
    }
    return sync()
      .then(function (merged) {
        lastById = merged;
        render();
      })
      .catch(function (e) {
        console.warn('[mam-heatmap] sync failed:', e);
      })
      .then(function () {
        refreshing = false;
        if (els) {
          els.btn.disabled = false;
          els.btn.classList.remove('mam-hm__refresh--busy');
        }
      });
  }

  window.__mamHeatmapRefresh = refresh;

  // ---------- mount ----------

  function unmount() {
    var existing = document.getElementById('mam-heatmap');
    if (existing) existing.remove();
    root = null;
    els = null;
  }

  function tryMount() {
    if (location.pathname !== '/learn' || !settings().mamHeatmap) {
      unmount();
      return;
    }
    if (root && root.parentElement) return;
    var anchor = document.getElementById('incompleteTasks');
    if (!anchor) return;

    unmount(); // clear any stale node from a previous injection
    buildRoot();
    anchor.insertBefore(root, anchor.firstChild);

    // Render from cache immediately, then incremental-sync and re-render.
    store.get(ACT_KEY).then(function (cached) {
      lastById = cached || {};
      render();
      refresh();
    });
  }

  function onSettingsChanged() {
    if (location.pathname !== '/learn' || !settings().mamHeatmap) {
      unmount();
      return;
    }
    if (root && root.parentElement) render();
    else tryMount();
  }

  function init() {
    if (location.pathname !== '/learn') return;
    document.addEventListener('mam-settings', onSettingsChanged);
    tryMount();
    if (root) return;

    // #incompleteTasks not in the DOM yet: watch for it (bounded).
    var observer = new MutationObserver(function () {
      if (document.getElementById('incompleteTasks')) {
        tryMount();
        if (root) observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 30000);
  }

  init();
})();
