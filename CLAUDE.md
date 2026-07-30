# CLAUDE.md — MathAcademy Macchiato

MV3 extension (plain JS/CSS, **no build step**, loaded unpacked in Brave/Chrome) that
themes mathacademy.com in Catppuccin Macchiato and adds an activity heatmap. All files
at repo root.

- **`SPEC.md`** — internal contract: the full `--ctp-*` palette, `chrome.storage.sync`
  keys + defaults. Read it before touching colors or settings.
- **`README.md`** — user-facing feature list + install steps.
- This file — how to *work* in the repo: invariants, verification, ship checklist, gotchas.

The user is learning; keep explanations concise and to the point.

## Files

| file | role |
|---|---|
| `theme.css` (~1200 lines) | the whole theme. Every rule gated on `html:not([data-mam-off])`. |
| `settings.js` | runs at `document_start`; reads `chrome.storage.sync`, stamps `<html>` attributes (`data-mam-off`, `data-mam-palette`, `data-mam-text`, `data-mam-hide-xp`), injects the bundled Inter `@font-face`, exposes `window.__mamSettings`. |
| `app.js` | stamps `data-ma-type` on task cards (CSS can't select on label text) so theme.css can color-code task types. |
| `heatmap.js` / `heatmap.css` | activity heatmap (vanilla port of MA Grid, MIT). |
| `options.html` / `options.js` | settings popup. |
| `manifest.json` | version lives here — bump every ship. |

## CSS invariants (do not break)

- **Gate everything** on `html:not([data-mam-off])` — that attribute is the theme's
  on/off switch. An ungated rule leaks into the user's light mode.
- **All color flows through the `--ctp-*` vars** defined once in the `:root` block. Never
  hardcode a hex in a rule — a new palette = override the var block only (that's how the
  `[data-mam-palette="fusion"]` variant works). Text tone = `[data-mam-text="white|warm"]`.
- **CSS can't read text**, so JS stamps attributes for it: `data-ma-type` (app.js),
  `data-mam-*` (settings.js). Selector-on-content problems are solved in JS, not CSS.
- **Keep braces balanced.** Before committing theme.css, verify:
  `[ $(grep -o '{' theme.css | wc -l) = $(grep -o '}' theme.css | wc -l) ]`

## Ship checklist (the user does this after every fix)

1. Bump `version` in `manifest.json`.
2. Verify theme.css braces balance.
3. `git add -A && git commit && git push origin main` — then confirm `local == origin/main`.
4. Rebuild the Downloads zip and remove the old one:
   `rm -f ~/Downloads/mathacademy-darkmode-v*.zip && zip -qr ~/Downloads/mathacademy-darkmode-v<X.Y.Z>.zip . -x '.git/*' '.DS_Store'`
5. The user reloads the unpacked extension in Brave to test.

## Live verification (test before implementing)

The user prefers seeing a change simulated on the real logged-in site before it lands.

- The **chrome-devtools MCP** drives a **separate, logged-in Chrome that has NO extension
  loaded** — so its pages are *unthemed* by default. Use it to read the real DOM and to
  simulate the theme.
- **Simulate the theme:** serve the repo over a local CORS server and inject it:
  - `python3 -m http.server 8137 --bind 127.0.0.1` (run from repo root)
  - inject `<link href="http://127.0.0.1:8137/theme.css?{ts}">` → applies dark mode
    (default palette), because every rule is gated on `html:not([data-mam-off])`.
  - add a `<style>` with candidate rules on top, then screenshot before/after and
    read `getComputedStyle` to confirm exact values.
- **READ-ONLY on MathAcademy.** Never start, answer, or submit a task, lesson, quiz, or
  exam on the user's account. Inspect only. Read-only lesson viewer: `/topics/{topicId}`.

## Lesson math rendering — the big gotcha

MathAcademy pre-renders **lesson** math **server-side to SVG** (`.mjpage` wrapper). Color
emphasis is an SVG **`fill` attribute**, NOT a CSS `color` — so `[style*="color:…"]` rules
only hit MathJax's invisible CHTML copies and never touch the visible glyphs. Override the
fill directly, **scoped to `.mjpage`** (the `#graph` mastery map is a separate SVG with its
own rules — don't let math rules leak into it):

| `fill` | meaning | our treatment |
|---|---|---|
| `currentColor` | ordinary glyphs | follows the light body text — leave alone |
| `black` | bold vectors, plain numbers, fraction bars (author's default emphasis) | → `--ctp-yellow` (gold), so it stays distinct from body text |
| `red` | component emphasis | kept (site red reads fine on dark) |
| `blue` / `green` | component emphasis | → `--ctp-blue` / `--ctp-green` |
| `lightgray` (a `<rect>`) | `\bbox` highlight box | → `--ctp-surface2` |

**Different surface, different pipeline:** the **placement/diagnostic exam** renders math
**client-side** (MathJax CHTML, `currentColor`) — it's already themed and needs no fill
overrides. Don't confuse the two.

## Site facts / API (student = Maximus, id 29594)

- `GET /api/users/current` — `{ user: { id, … } }`.
- `GET /api/courses/{cid}/students/{sid}/knowledge-graph` — `.topics` is an **object keyed
  by topic id** (not an array), values have `{ id, name, unit, module, … }`.
- Courses: **136 = Mathematical Foundations III (current)**, 111 = Foundations II, 113 = Foundations I.
- XP history: `GET /api/previous-tasks/{encodeURIComponent(dateString)}`, cookie auth,
  paginate backwards; timestamps have a bogus trailing `Z` but are local time.
- No leaderboard/other-league JSON — that's server-rendered HTML only.

## Note on memory

The user's cross-session auto-memory for this work lives under the *mnist* project's memory
dir (`~/.claude/projects/-Users-maximus-projects-mnist/memory/mathacademy-macchiato-extension.md`)
and does **not** auto-load here. This CLAUDE.md is the durable in-repo record.
