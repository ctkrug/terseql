# Terseql

**▶ Live demo · [apps.charliekrug.com/terseql](https://apps.charliekrug.com/terseql/)**

[![CI](https://github.com/ctkrug/terseql/actions/workflows/ci.yml/badge.svg)](https://github.com/ctkrug/terseql/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The daily SQL puzzle where shortest wins. One puzzle a day: a small schema, a plain-English
goal, and a real SQLite database running in your browser. Getting the query working is the easy
part. Your score is its UTF-8 byte length, and the board sorts ascending.

For developers and analysts who write SQL well enough that "correct" stopped being interesting.

## How a round goes

Day one asks for each customer's total spend, highest first, skipping anyone who never ordered.
The query you'd put in a pull request is 126 bytes:

```sql
SELECT c.name, SUM(o.amount) AS total
FROM customers c JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY total DESC
```

That's the starting line. The alias goes, because `ORDER BY 2` points at the column by position.
`JOIN ... ON` becomes a comma join and a `WHERE`. Whitespace the parser doesn't need goes:

```sql
SELECT name,SUM(amount)FROM customers c,orders WHERE customer_id=c.id GROUP BY 1 ORDER BY 2 DESC
```

96 bytes, same rows, still passes every hidden fixture. Somewhere below that is a query you
haven't thought of yet.

Solve it and you get a share card, which is the trail rather than the answer:

```
Terseql 2026-07-16 — Top Spenders

🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦 126
🟦🟦🟦🟦🟦🟦🟦🟦🟦 113
🟦🟦🟦🟦🟦🟦🟦🟦 101
🟩🟩🟩🟩🟩🟩🟩🟩 96

96 bytes (4 cuts)
🔥 4-day streak
https://apps.charliekrug.com/terseql
```

It carries no query text, so pasting it in a group chat can't spoil the day for anyone.

## What makes the score mean something

- **A real engine, in your tab.** sql.js (SQLite compiled to WebAssembly) executes every query
  client-side. Hit Run and the actual result table appears. There is no backend in the solve
  loop at all, and the WASM is compiled while you're still reading the prompt, so the first Run
  is as instant as the tenth.
- **Hidden fixtures.** Each puzzle ships seeded databases you never see, covering empty groups,
  ties, NULLs and negatives. A query that fits the visible sample and nothing else is told it
  passed the sample and failed a hidden case, and never which one. Working that out is the
  puzzle.
- **Bytes, counted honestly.** UTF-8 bytes, not characters, so a multi-byte glyph costs what it
  actually costs. The counter rolls digit by digit as you trim.
- **A fresh database every Run.** Write `DROP TABLE orders` if you like; the next Run starts from
  the same ground truth, and grading uses its own databases regardless.
- **Daily rotation.** Puzzles are keyed to the UTC calendar date, so everyone solves the same one
  on the same day. Five are authored.

## Running it

```bash
npm install
npm run dev           # dev server
npm test              # full suite
npm run test:coverage # full suite + a coverage report
npm run lint
npm run build         # -> dist/ (landing page) + dist/app/ (the app)
npm run preview       # serve the built site: landing at /, app at /app/
```

The build is one self-contained directory using only relative paths, so it serves correctly from
a domain root or a subpath. To point the app at a shared leaderboard, set `VITE_LEADERBOARD_URL`
at build time; with it unset the app runs standalone on local personal bests.

## Stack

- **JavaScript**, no framework. It's small enough that one isn't needed.
- **[sql.js](https://github.com/sql-js/sql.js)**: SQLite compiled to WebAssembly, run entirely
  client-side.
- **[Vite](https://vitejs.dev/)**: dev server + static production build.
- **[Vitest](https://vitest.dev/)**: unit, DOM and real-engine integration tests.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the code map, data flow and decisions
- [`docs/VISION.md`](docs/VISION.md): what this is and why
- [`docs/DESIGN.md`](docs/DESIGN.md): the visual direction and tokens
- [`docs/BACKLOG.md`](docs/BACKLOG.md): what's built vs. planned

## License

MIT. See [`LICENSE`](LICENSE).

---

More of Charlie's projects → [apps.charliekrug.com](https://apps.charliekrug.com)
