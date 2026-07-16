# Terseql

A daily code-golf puzzle: write the **shortest correct SQL query** that passes a hidden test
suite against a real, in-browser SQLite database. Leaderboard by byte count. New puzzle every
day.

## What it is

Each day, Terseql ships a puzzle: a schema, some seed data, and a plain-English goal ("return
each customer's total spend, highest first"). You write a SQL query in the browser. It runs
instantly against a real SQLite engine — compiled to WebAssembly via
[sql.js](https://github.com/sql-js/sql.js), no server round-trip — and is checked against a
hidden suite of edge-case fixtures so you can't just eyeball the sample data and hardcode an
answer. If it passes, your byte count goes on the board.

The game is the tension between _correct_ and _short_: getting the right answer is the floor,
not the ceiling. The leaderboard is sorted by `LENGTH(query)` in bytes, and shaving one more
character off a working query is most of the fun.

## Why

Code-golf sites exist. SQL practice sites exist. Nothing pairs them with a Wordle-style daily
cadence and an honest, can't-be-gamed grader running live in the browser. Terseql is that
pairing: one puzzle a day, instant feedback, a real database engine, and a byte counter that
ticks down as you trim your query character by character.

## Features

- **A real engine, in your tab** — sql.js (SQLite → WebAssembly) executes every query
  client-side. Hit Run and the actual result table appears; there's no backend in the solve
  loop at all.
- **Hidden fixture grading** — each puzzle ships seeded databases you never see, covering
  empty groups, ties, NULLs and negatives. A query that fits the visible sample and nothing
  else fails, which is the point.
- **A live byte counter** — UTF-8 bytes (not characters, so exotic glyphs can't buy you a
  lower score), rolling digit by digit as you trim.
- **Daily rotation** — puzzles are keyed to the UTC calendar date, so everyone solves the same
  puzzle on the same day. Five are authored today.
- **Win celebration & share card** — a Wordle-style card showing your golf trail (96 → 74 → 61) as a shrinking staircase. It carries no query text, so it can't spoil the puzzle.
- **Personal bests, streaks and a leaderboard** — bests and streaks persist locally; the shared
  board is optional and the app degrades to a designed solo mode without it.
- **Synthesized sound** — every SFX is generated from oscillators and noise at runtime (no
  audio files), with a mute that persists.

## Running it

```bash
npm install
npm run dev           # dev server
npm test              # full suite
npm run test:coverage # full suite + a coverage report
npm run lint
npm run build         # → dist/ (landing page) + dist/app/ (the app)
npm run preview       # serve the built site: landing at /, app at /app/
```

The build is one self-contained directory using only relative paths, so it serves correctly
from a domain root or a subpath. To point the app at a shared leaderboard, set
`VITE_LEADERBOARD_URL` at build time; with it unset the app runs standalone on local personal
bests.

## Stack

- **JavaScript**, no framework — small enough that one isn't needed.
- **[sql.js](https://github.com/sql-js/sql.js)** — SQLite compiled to WebAssembly, run entirely
  client-side.
- **[Vite](https://vitejs.dev/)** — dev server + static production build.
- **[Vitest](https://vitest.dev/)** — unit, DOM and real-engine integration tests.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the code map: modules, data flow, decisions
- [`docs/VISION.md`](docs/VISION.md) — what this is and why
- [`docs/DESIGN.md`](docs/DESIGN.md) — the visual direction and tokens
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — what's built vs. planned

## Status

The core loop is complete and playable: write a query, run it against a real database, submit,
get graded against hidden fixtures, celebrate, and chase a shorter one. Remaining work is
listed in the backlog — chiefly a real shared leaderboard backend (the client is built and
waiting for an endpoint).

## License

MIT — see [`LICENSE`](LICENSE).
