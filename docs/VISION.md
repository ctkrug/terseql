# Terseql — vision

## The problem

SQL practice tools are either dry (a tutorial with a "check answer" button) or generic code-golf
sites that don't know anything about SQL specifically — no query editor, no real database engine,
scoring by whatever the judge feels like. Nobody has paired the two things that actually make
a daily puzzle habit-forming: a **Wordle-style daily cadence** and **instant, honest feedback**
from a real engine, with a score that's satisfying to chase (byte count) instead of arbitrary
points.

## Who it's for

People who already know SQL reasonably well and enjoy the kind of puzzle where "I got it
working" is the boring part and "I got it working in 61 bytes" is the actual game — the same
crowd that does Advent of Code golf leaderboards, Wordle, and byte-count code-golf challenges
on sites like codegolf.stackexchange.com, but nothing currently gives them a _SQL-specific_
version of that loop.

## The core idea

Every day, one puzzle: a small schema, a plain-English goal, and a visible sample dataset to
experiment against. You write a SQL query in the browser. It runs instantly, client-side,
against a real SQLite engine (sql.js — SQLite compiled to WebAssembly) — no server round-trip,
no waiting. Correctness is checked against a **hidden suite of fixture databases** you never
see, not just the visible sample, so a query that merely fits the preview data and doesn't
generalize still fails. Once you pass, your score is your query's **UTF-8 byte length** — and
the leaderboard is sorted by that number, ascending. The tension between "correct" and "short"
_is_ the game.

## Key design decisions

- **Client-side grading, no server round-trip for solving.** sql.js runs the actual SQLite
  engine in WASM in the browser. This is what makes the "type a character, watch the byte
  count and result table update instantly" loop possible — there's no latency to design around.
  A backend only enters the picture for the shared daily leaderboard (submission + read), which
  is deliberately a thin, separate concern from solving.
- **Hidden fixtures, not just the visible sample.** Every puzzle ships 1+ additional seeded
  databases the player never sees, covering edge cases the visible sample doesn't (empty
  groups, ties, NULLs, negative values). A query only counts as correct if it matches expected
  output on _every_ fixture. This is the "can't be gamed by hardcoding" property the wow
  moment depends on — see `docs/DESIGN.md` and the grader tests in `tests/grader.test.js` for
  how it's enforced today.
- **Score is UTF-8 bytes, not characters.** Prevents gaming the count with multi-byte
  characters that display as "short" but aren't. Computed with `TextEncoder`, tested directly.
- **One puzzle a day, deterministic.** Same puzzle, same fixtures, for everyone on a given day
  — this is what makes the leaderboard meaningful ("twelve fewer bytes than you thought was
  possible" only lands if you're solving the _same_ problem as everyone else).
- **Static, serverless solving; a small backend only for the shared leaderboard.** The whole
  solving experience — editor, grading, byte counter, result rendering — is a static site
  (`vite build`, one `dist/` directory, relative asset paths so it can be hosted at a subpath
  like `apps.charliekrug.com/terseql`). A shared cross-player leaderboard needs _some_ backend
  to accept and serve submissions, but it's explicitly out of scope for early builds — see
  `docs/BACKLOG.md`. Until then, `src/leaderboard.js` tracks personal bests in `localStorage`
  so the core loop works standalone.
- **No framework.** The UI surface (editor, byte counter, result table, puzzle prompt) is small
  enough that plain DOM + a few modules is less code and less to learn than adopting React/Vue
  for a handful of interactive elements.

## What "v1 done" looks like

- The wow moment is real: open the page, write/edit a query, watch the result table update and
  the byte counter tick live, submit a passing query, see a leaderboard.
- At least a handful of hand-authored daily puzzles exist with well-tested hidden fixtures
  (not just day one).
- A real (even if minimal) shared leaderboard: submitting a passing query records your byte
  count somewhere other players' browsers can read, not just `localStorage`.
- Win celebration, sound, and the full `docs/DESIGN.md` juice plan are implemented — this is a
  game, and it needs to feel like one, not just function like a grading script.
- Mobile-usable: the query editor and result table are usable on a phone screen, not just
  desktop.
- Streak tracking: which days you've solved, visible somewhere, Wordle-style.

Anything past that — puzzle archive browsing, difficulty ratings, alternate SQL dialects,
accounts/auth beyond whatever the leaderboard needs — is deliberately future work, not v1.
