# MathAcademy Macchiato — internal contract

MV3 extension, plain JS/CSS, no build step, loaded unpacked. All files at repo root.

## Palette (CSS custom properties, defined once in theme.css `:root`)

```
--ctp-base:#24273a; --ctp-mantle:#1e2030; --ctp-crust:#181926;
--ctp-surface0:#363a4f; --ctp-surface1:#494d64; --ctp-surface2:#5b6078;
--ctp-overlay0:#6e738d; --ctp-subtext0:#a5adcb; --ctp-text:#cad3f5;
--ctp-lavender:#b7bdf8; --ctp-blue:#8aadf4; --ctp-mauve:#c6a0f6;
--ctp-green:#a6da95; --ctp-red:#ed8796; --ctp-peach:#f5a97f;
--ctp-yellow:#eed49f; --ctp-teal:#8bd5ca;
```

## Settings (chrome.storage.sync keys + defaults)

| key            | default | meaning                                            |
|----------------|---------|----------------------------------------------------|
| mamTheme       | true    | apply theme.css                                    |
| mamHeatmap     | true    | render heatmap on /learn                           |
| mamStartDate   | ""      | ISO `yyyy-mm-dd`; stats ignore days before it and earlier cells render unhighlighted — the grid itself always spans the trailing 12 months |
| mamThLow       | 1       | XP >= this → level 1 cell                          |
| mamThMed       | 15      | XP >= this → level 2 cell                          |
| mamThHigh      | 30      | XP >= this → level 3 cell                          |
| mamHideXpFrame | false   | hide the site's native weekly XP widget            |
| mamStatsShown  | all true | object {streak,longest,avg,max,month,bestMonth: bool} — which heatmap stats render |

`settings.js` (document_start) is the single settings authority: it reads sync
storage, stamps `document.documentElement`:

- `data-mam-off` present ⇔ mamTheme false (theme.css gates everything on
  `html:not([data-mam-off])`)
- `data-mam-hide-xp` present ⇔ mamHideXpFrame true

It also sets `window.__mamSettings` (plain object with the keys above) in the
content-script world and dispatches `document` CustomEvent `"mam-settings"`
after any `chrome.storage.onChanged`. `heatmap.js` reads `window.__mamSettings`;
when absent (dev injection into a bare page) it falls back to defaults +
`localStorage.mamSettings` JSON override.

## Activity cache (chrome.storage.local)

- `mamActivities`: object keyed by task id →
  `{ id, pointsAwarded, completed }` where `completed` = epoch ms (LOCAL time —
  the API's trailing "Z" is bogus and must be stripped before parsing).
- `mamLastSync`: epoch ms of last successful refresh.

Incremental sync: page backwards from `new Date().toString()` cursor via
`GET /api/previous-tasks/{encodeURIComponent(cursor)}` (same-origin,
`credentials:'include'`); next cursor = oldest `completed` in page minus 1 ms;
stop on empty page, on seeing an id already cached, after 3 years, or 200
pages; 200 ms delay between pages. (Ported from MA Grid, MIT — see LICENSE.)

## Heatmap DOM (plain DOM, NO shadow root, so theme.css/heatmap.css apply)

```
div#mam-heatmap.mam-hm
  .mam-hm__header
    .mam-hm__title            "Activity"
    .mam-hm__refresh          button, "↻"
  .mam-hm__stats              6 × .mam-hm__stat
    .mam-hm__stat > .mam-hm__stat-value + .mam-hm__stat-label
      (Current Streak, Longest Streak, Avg Daily XP, Max Daily XP,
       This Month XP, Best Month XP — all computed from mamStartDate onward)
  .mam-hm__wrap
    .mam-hm__months > .mam-hm__month          (inline grid-column)
    .mam-hm__grid
      .mam-hm__wdays > .mam-hm__wday          (M, W, F)
      .mam-hm__days  > .mam-hm__cell.mam-hm__cell--l{0|1|2|3}
                       (inline gridRow/gridColumn, data-date="yyyy-mm-dd",
                        data-xp="N")
  .mam-hm__footer
    .mam-hm__legend           "Less" + 4 cells + "More"
  .mam-hm__tooltip            one absolutely-positioned div, shown on cell hover
```

Mount: on `location.pathname === "/learn"` only, inserted as first child of
`#incompleteTasks`. Heatmap level colors in heatmap.css:
`--mam-l0:#363a4f; --mam-l1:#4a5f50; --mam-l2:#74a07a; --mam-l3:#a6da95;`
Card: background var(--ctp-mantle), 1px border var(--ctp-surface0), radius 6px.

## Site fixes contract (theme.css)

- Task-type badges: `app.js` stamps `data-ma-type="lesson|review|multistep|assessment"`
  on each task card (parent of `.taskHeader`). Type label = the DIRECT-CHILD
  first span: use `.taskHeader > span:first-of-type` (nested XP spans must NOT
  match — this was the dot-misalignment bug).
- League hover popup: `#leagueLevels` needs explicit mantle background.
- Promotion/demotion arrows: hide `td > img[src*="promotion-arrow"]` /
  `td > img[src*="demotion-arrow"]`; substitute `td:has(> img[src*="promotion-arrow"])::after`
  content "▲" green / "▼" red.
- Images: `img[src*="/graphics/"], img.logo` get
  `filter: invert(1) hue-rotate(180deg); mix-blend-mode: screen;`
