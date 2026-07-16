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

The game is the tension between *correct* and *short*: getting the right answer is the floor,
not the ceiling. The leaderboard is sorted by `LENGTH(query)` in bytes, and shaving one more
character off a working query is most of the fun.

## Why

Code-golf sites exist. SQL practice sites exist. Nothing pairs them with a Wordle-style daily
cadence and an honest, can't-be-gamed grader running live in the browser. Terseql is that
pairing: one puzzle a day, instant feedback, a real database engine, and a byte counter that
ticks down as you trim your query character by character.

## Planned features

- **Daily puzzle** — a new schema + prompt + hidden test suite every day, seeded so everyone
  gets the same puzzle and the same edge cases.
- **In-browser SQLite** — sql.js (SQLite → WASM) runs every query against a real engine
  client-side; results render instantly, no backend required to play.
- **Hidden test suite grading** — each puzzle ships extra fixture rows/tables not shown in the
  preview, so a query that merely matches the visible sample data still fails if it isn't
  actually correct.
- **Byte-count leaderboard** — score is `LENGTH(query)` in UTF-8 bytes; ties broken by
  submission time. Watch your byte count fall live as you edit.
- **Streaks & history** — track which days you've solved and your best byte count per puzzle,
  Wordle-style.
- **Query editor** — a small, fast SQL editor with syntax highlighting and instant run.

## Stack

- **JavaScript**, no framework — small enough that one isn't needed.
- **[sql.js](https://github.com/sql-js/sql.js)** — SQLite compiled to WebAssembly, run entirely
  client-side.
- **[Vite](https://vitejs.dev/)** — dev server + static production build.
- **[Vitest](https://vitest.dev/)** — unit tests for the grader and puzzle fixtures.

Static output, no server required — see [`docs/VISION.md`](docs/VISION.md) for the full design
and [`docs/BACKLOG.md`](docs/BACKLOG.md) for the build plan.

## Status

Early scaffold — see the backlog for what's built vs. planned.

## License

MIT — see [`LICENSE`](LICENSE).
