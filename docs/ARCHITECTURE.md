# Terseql — architecture

A map of the codebase for anyone (human or a later session) arriving cold. For _why_ the
product is shaped this way see [`VISION.md`](VISION.md); for the visual system see
[`DESIGN.md`](DESIGN.md); for what's left see [`BACKLOG.md`](BACKLOG.md).

## The shape of it

A no-framework static site. Plain DOM plus ES modules, built by Vite, with SQLite compiled to
WebAssembly (sql.js) doing the actual query execution **in the player's tab**. There is no
server in the solve loop — that's the whole point, and it's what makes the byte counter and
result table feel instant. The only network call in the product is the optional shared
leaderboard, and it's built so that its absence changes nothing about solving.

```
index.html ──► src/main.js ──► src/app.js ──┬──► src/ui/*      (rendering)
                                            ├──► src/grader.js (correctness + bytes)
                                            ├──► src/db.js     (sql.js/WASM)
                                            ├──► src/leaderboard.js       (localStorage)
                                            ├──► src/remote-leaderboard.js (optional HTTP)
                                            ├──► src/audio.js  (WebAudio SFX)
                                            └──► src/share.js  (share card text)
site/ ──► the landing page (own HTML/CSS, same tokens)
```

## Modules

| File                          | Responsibility                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `src/main.js`                 | Bootstrap only: resolve today's puzzle, mount the app, fall back to a written error |
| `src/app.js`                  | All page wiring — markup, events, the run/submit loop. Dependencies injectable      |
| `src/db.js`                   | Loads sql.js and seeds in-memory databases                                          |
| `src/grader.js`               | `byteLength`, result-set comparison, and grading against every fixture              |
| `src/leaderboard.js`          | Personal bests, the improvement `trail`, and streaks, in `localStorage`             |
| `src/remote-leaderboard.js`   | Optional shared-board client; every failure resolves to a reason code               |
| `src/share.js`                | Formats the Wordle-style share card (pure)                                          |
| `src/audio.js`                | Synthesized SFX + persisted mute (factory, so tests inject fakes)                   |
| `src/ui/byte-counter.js`      | The rolling byte dial — the signature detail                                        |
| `src/ui/result-table.js`      | Result rendering plus idle/running/empty/error states                               |
| `src/ui/leaderboard-panel.js` | Board rendering plus every "unavailable" state                                      |
| `src/ui/win-overlay.js`       | The win moment; owns no solve state                                                 |
| `src/puzzles/`                | One file per day + `index.js` (rotation) + `schema.js` (shape + validation)         |

## Data flow

**Run** (preview): editor text → `executeQuery` → a fresh database seeded from
`puzzle.previewSetupSql` → `db.exec` → `createResultPanel.showResult`. Errors are values, not
throws — a SQLite complaint becomes a designed panel state.

**Submit** (grade): editor text → `gradeQuery` → runs the query against **every** fixture in
`puzzle.fixtures`, each in its own fresh database → all must match `expected` → `recordSolve`
to `localStorage` → win overlay → fire-and-forget POST to the shared board.

Every run and every fixture gets a brand-new database. The player may legitimately write
`DROP TABLE`, so isolation is a correctness requirement, not a nicety.

## Decisions worth knowing before you change something

- **Column names are not graded**, only column count, column order, and row order. Charging a
  golfer bytes for `AS total` would tax a label nobody reads. Pinned in `tests/grader.test.js`.
- **Puzzle ids are their UTC date** (`2026-07-16`) and rotation is a date lookup — but a puzzle
  id is NOT a reliable stand-in for "the day the player played." `getPuzzleForDate` re-serves
  the most recent authored puzzle once the catalogue runs dry, so several real days can share
  one puzzle id. Streaks are therefore tracked in their own store
  (`leaderboard.js`'s `terseql:solved-days`), keyed off `solvedAt` and written on every correct
  solve regardless of whether it improved that puzzle's personal best — decoupled from the
  per-puzzle best store entirely. Streak math itself is still plain string arithmetic on
  `YYYY-MM-DD` days, no timezones.
- **The grader never reports _which_ hidden fixture failed** to the player, only that one did.
  The hidden half is half the puzzle.
- **Nothing that reaches the network carries query text.** The board is public; shipping the
  query would let anyone scrape the day's answers.
- **All rendering uses `textContent`.** A query can return markup (`SELECT '<img onerror=…>'`)
  and a backend can return a hostile name; both must render inert.
- **`src/db.js` builds its Node-side WASM path by string concatenation.** `new URL(...,
import.meta.url)` looks correct but Vite statically rewrites that exact pattern into an asset
  URL, which is not a filesystem path.
- **The engine is warmed at mount.** ~660KB of WASM compiles while the player reads the prompt
  rather than between their click and the table.
- **The player's last action owns the results panel.** Run and Submit both write it and both are
  reachable from the keyboard, so they share one request counter in `app.js`: anything older
  that resolves late stays silent instead of painting over the answer. A solve still records
  locally even when its verdict loses the panel — the record is a fact, not a paint. When a
  panel-owning Submit passes, it re-runs the query against its own preview seed (the preview
  fixture and `previewSetupSql` are authored identically) purely to paint that result — `flash()`
  is a decoration on top of real content, not a substitute for it.
- **The results panel's `aria-live` region is a dedicated status paragraph, not the panel
  itself.** `#results` can hold an up-to-200-row table; announcing that whole subtree on every
  Run is unusable for a screen reader. Only a one-line summary ("12 rows", the error text) is
  ever announced, via a visually-hidden node inside `createResultPanel`.
- **Only a personal best reaches the shared board.** Posting every correct resubmit would pile
  duplicate rows onto a public board, or cost a player their standing to their own sloppier
  second try. Local `recordSolve` keeps every solve; the network only hears about improvements.
- **A stored `trail` is rebuilt, not trusted.** `recordSolve` only appends strictly better
  counts, so a real trail descends and ends at `bytes`. `readStore` re-establishes that
  invariant, because the share card reads the trail and a corrupt one would have the player
  posting a score they never got.
- **The win headline is derived from the byte delta**, never computed alongside it — that's how
  a tie came to be headlined "Shorter" above "Matched your best".

## Testing

`npm test` (vitest), `npm run test:coverage` for a report. Node environment by default;
DOM-facing suites opt in per file with a `// @vitest-environment jsdom` docblock.

- Pure logic (`grader`, `share`, streaks, `dedent`, rotation) is tested directly.
- `src/app.js` takes its engine, network, clipboard and audio as injectable dependencies, so
  `tests/app.test.js` drives the whole loop fast and deterministically with fakes.
- `tests/integration.test.js` deliberately does **not** inject: it drives the real WASM engine
  end to end, so an engine-path break can't hide behind a passing mock.
- `tests/puzzles.test.js` is parametrized over the registry — every new puzzle is automatically
  held to the catalogue bar (well-formed, 3+ fixtures, reference solution grades correct).

Coverage excludes `src/puzzles/day-*.js` (content, already held to the catalogue bar by the
parametrized suite) and `src/main.js` (the bootstrap), so the number reports the logic that can
actually be wrong: **98.9% of lines, 97.3% of branches** across 345 tests.

## Running it

```bash
npm install
npm run dev           # dev server
npm test              # full suite
npm run test:coverage # full suite + a coverage report
npm run lint
npm run build         # → dist/ (landing) + dist/app/ (the app)
npm run preview       # serve the built site: landing at /, app at /app/
```

`npm run build` emits one self-contained directory with **only relative paths**, so it serves
correctly from a subpath such as `apps.charliekrug.com/terseql/`. Set `VITE_LEADERBOARD_URL` at
build time to point the app at a shared leaderboard; with it unset the app runs in solo mode.

## Adding a puzzle

1. Copy an existing `src/puzzles/day-000N.js`; set `id` to its UTC date.
2. Give it `schemaSql`, `previewSetupSql`, `referenceSql`, and 3+ fixtures — the preview plus at
   least two hidden ones that punish a query which only fits the visible sample.
3. Register it in `src/puzzles/index.js`.
4. `npm test` — the parametrized suite verifies your reference solution against your fixtures.
   If it fails, the puzzle is unsolvable as authored.
