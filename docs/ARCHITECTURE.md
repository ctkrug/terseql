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
- **Puzzle ids are their UTC date** (`2026-07-16`). Rotation is a date lookup, streaks are runs
  of consecutive ids — so streak math is plain string arithmetic with no timezones.
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

## Testing

`npm test` (vitest). Node environment by default; DOM-facing suites opt in per file with a
`// @vitest-environment jsdom` docblock.

- Pure logic (`grader`, `share`, streaks, `dedent`, rotation) is tested directly.
- `src/app.js` takes its engine, network, clipboard and audio as injectable dependencies, so
  `tests/app.test.js` drives the whole loop fast and deterministically with fakes.
- `tests/integration.test.js` deliberately does **not** inject: it drives the real WASM engine
  end to end, so an engine-path break can't hide behind a passing mock.
- `tests/puzzles.test.js` is parametrized over the registry — every new puzzle is automatically
  held to the catalogue bar (well-formed, 3+ fixtures, reference solution grades correct).

## Running it

```bash
npm install
npm run dev      # dev server
npm test         # full suite
npm run lint
npm run build    # → dist/ (landing) + dist/app/ (the app)
npm run preview  # serve the built app
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
