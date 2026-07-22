# MathAcademy Macchiato

Catppuccin Macchiato theme + activity heatmap for [mathacademy.com](https://mathacademy.com),
as a single Chrome/Brave MV3 extension. Replaces the Dark Reader per-site fix
and the MA Grid extension with one integrated, configurable package.

## Features

- **Full Macchiato theme** — base/mantle surfaces, mauve headings, blue links,
  themed buttons, progress bars, leaderboard, league popup.
- **Cleaner task cards** — lock/checkmark images replaced with colored badges;
  task types color-coded (Lesson = blue, Review = green, Multistep = peach,
  Assessment = mauve) via a colored dot and left-edge accent.
- **Math graphics dark-mode** — invert + hue-rotate + screen-blend so axes/labels
  turn light while curve colors and the page background stay seamless.
- **Activity heatmap** (ported from [MA Grid](https://github.com/thaske/ma-grid),
  MIT) — Macchiato green levels, streak/XP stats, monthly XP stats, and a
  **start date** setting so the grid begins when you actually started grinding
  (continuous streak view instead of a year of empty cells).

## Install (Brave/Chrome)

1. `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Disable Dark Reader for mathacademy.com and remove/disable MA Grid to avoid
   double-theming.

Settings: extension icon → Options (theme toggle, heatmap toggle, start date,
level thresholds, hide native weekly XP widget, clear cache).

## Files

| file        | role                                                        |
|-------------|-------------------------------------------------------------|
| theme.css   | the whole Macchiato theme (gated on `html:not([data-mam-off])`) |
| heatmap.css | heatmap card styles                                         |
| settings.js | document_start: reads storage, stamps `<html>` attributes   |
| app.js      | tags task cards with `data-ma-type` for CSS color-coding    |
| heatmap.js  | data sync from `/api/previous-tasks` + grid render          |
| options.*   | settings UI (`chrome.storage.sync`)                         |

See `SPEC.md` for the internal contract.
