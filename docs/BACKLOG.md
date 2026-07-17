# Terseql — backlog

Epics are ordered; within an epic, stories are roughly build order. Every story has concrete,
verifiable acceptance criteria — a later run should be able to check each one true/false.

## Epic 1 — Core solve loop

The wow moment: writing SQL, watching it execute live against a real database, and watching the
byte count fall as you trim the query.

- [x] **1.1 — Live query execution against a real in-browser database (WOW MOMENT)**
  - Typing a query and clicking Run executes it via sql.js against the puzzle's preview
    database and renders an HTML result table within 200ms of clicking Run.
  - The byte counter updates on every keystroke in the editor, computed via `TextEncoder`
    UTF-8 length (not character count).
  - A syntactically invalid query shows an inline error message in the results area instead of
    throwing an uncaught exception.
  - **Measured caveat:** once the engine is up a Run renders in ~20ms, comfortably inside the
    200ms bar. The very first Run of a session still costs ~280ms on the preview build because
    it waits on the ~660KB WASM compile; `warmEngine()` starts that at mount to shrink the gap
    (334ms → 279ms locally, and more on a real network, where the download isn't free). Getting
    the first Run under 200ms too would mean a smaller engine build or streaming compilation.

- [x] **1.2 — Hidden fixture grading**
  - Submitting a query runs it against every fixture in `puzzle.fixtures` (not just the
    preview) and only marks the puzzle solved if all pass.
  - A query that matches the preview's visible sample data but fails a hidden fixture is
    reported as incorrect.
  - `gradeQuery()` has unit test coverage proving a hardcoded-rows query fails a hidden
    fixture even though it matches the preview (baseline already in `tests/grader.test.js`).

- [x] **1.3 — Live byte counter juice**
  - When the byte count changes, the digit(s) that changed animate with a roll transition
    (90ms ease-out per `docs/DESIGN.md`) rather than snapping instantly.
  - The roll animation is replaced with an instant update when `prefers-reduced-motion` is set.

- [x] **1.4 — Win celebration**
  - Passing a query for the first time on a puzzle shows an overlay with byte count,
    personal-best delta, and a "Copy share card" button.
  - Clicking "Copy share card" copies a Wordle-style emoji/text grid (no image) to the
    clipboard.
  - The overlay is dismissible (Escape key or close button) without losing the solved state.

- [x] **1.5 — Design polish pass: core solve loop**
  - Editor, Run button, and result table match `docs/DESIGN.md` tokens (colors, fonts, radius,
    shadow/glow).
  - Every interactive control (Run button, editor) has themed hover/focus-visible/active
    states — no unstyled native defaults.

## Epic 2 — Daily puzzles & leaderboard

- [x] **2.1 — Deterministic daily puzzle rotation**
  - `getTodaysPuzzle()` resolves the puzzle by matching the current calendar date (UTC) to a
    puzzle id, not by array position, and falls back to the most recent past puzzle if there's
    no exact match for today.
  - A unit test proves two different mocked "current dates" resolve to two different puzzles
    when both exist in the registry.

- [x] **2.2 — Five hand-authored puzzles**
  - At least 5 puzzles exist under `src/puzzles/`, each with `schemaSql`, `previewSetupSql`,
    `referenceSql`, and 3+ fixtures.
  - Every puzzle passes an automated check (extending `tests/puzzles.test.js`) that its
    `referenceSql` matches `expected` on every one of its own fixtures.

- [ ] **2.3 — Shared leaderboard backend**
  - Submitting a passing query POSTs `{puzzleId, bytes, timestamp}` — no query text, so
    answers can't be scraped off the leaderboard — to a backend endpoint, and the day's top N
    byte counts are fetched and rendered.
  - If the backend is unreachable, the UI degrades to showing only the local personal best,
    with a visibly designed "leaderboard unavailable" state (not a silent blank panel).
  - **Client side is done; the story is not.** `src/remote-leaderboard.js` submits and fetches
    against a `VITE_LEADERBOARD_URL` endpoint, carries no query text, and resolves every
    failure to a reason code the panel renders as designed copy (solo / offline / slow / down /
    confused) — all covered by tests against a fake backend. What's missing is a **real
    deployed endpoint**, so today the app always runs in solo mode. Finishing this means
    standing up the service (accept a submission, serve the day's top N, rate-limit it) and
    setting the build-time env var. Until then the criteria above are not met in production.

- [x] **2.4 — Streak tracking**
  - `getSolvedCount()` / a new `getCurrentStreak()` are covered by unit tests, including a
    broken-streak case (a gap day resets the streak to 1, not continues it).
  - The current streak count is surfaced somewhere visible on the puzzle page.

- [x] **2.5 — Design polish pass: daily puzzles & leaderboard**
  - Leaderboard panel and streak indicator use `docs/DESIGN.md`'s support-accent (amber) token
    for "your best," not the primary accent — per the tokens table.
  - The leaderboard's empty state (no submissions yet / backend unreachable) is a designed
    state, not a blank area.

## Epic 3 — Polish, accessibility & landing page

- [x] **3.1 — Responsive layout**
  - Page renders with no horizontal scroll and no overlapping elements at 390px, 768px, and
    1440px viewport widths.
  - At 1440px, the editor+results column occupies ≥55% of viewport width, per
    `docs/DESIGN.md`'s layout intent.

- [x] **3.2 — Sound design**
  - The keystroke/run/fail/pass/win SFX listed in `docs/DESIGN.md` are implemented via
    WebAudio oscillators/noise — zero binary audio files in the repo.
  - A mute toggle exists, its state persists across reloads via `localStorage`, and the
    `AudioContext` is created lazily on first user gesture, not on page load.

- [x] **3.3 — Accessibility pass**
  - All icon-only buttons (e.g. the mute toggle) have an `aria-label`; the results area has a
    dedicated `aria-live` status line that announces pass/fail state changes as a short summary
    (not the visible table content — see defect 4.3).
  - Every interactive element is reachable and operable via Tab + Enter/Space alone, with a
    visible focus ring.

- [x] **3.4 — Landing/marketing page**
  - A `site/` directory contains a static landing page using the same `docs/DESIGN.md` tokens
    and fonts as the app, buildable to one output directory with relative asset paths.
  - The landing page includes a favicon matching the app's and no placeholder/lorem-ipsum copy.

## Known defects (found at closeout)

- [x] **4.1 — A solve on a fallback day doesn't count toward the streak** — fixed.
  - `getPuzzleForDate` serves the most recent past puzzle when today has none authored, so
    `recordSolve` keying the streak to the _puzzle's_ id (while `computeStreak` counted
    _calendar days_) let a solve on a fallback day vanish from the streak once the catalogue
    ran out.
  - Fixed by recording every solved calendar day (`solvedAt`, not the puzzle id) in its own
    `terseql:solved-days` store, written unconditionally on every correct solve. The streak
    now survives catalogue exhaustion. Regression tests: `tests/leaderboard.test.js`
    ("keeps growing across real days that reuse the same puzzle id").

- [x] **4.2 — The results panel can stick on "Running…"** — fixed.
  - `run()` painted "Running…" and only `run()` cleared it. A Submit that supersedes an
    in-flight Run made the run return silently, and a passing grade only called
    `results.flash("pass")`, which is decorative and replaced no content — a bare Submit with
    no prior Run left the idle state showing behind its own win.
  - Fixed by re-running the query against its own preview seed on a passing, panel-owning
    submit and painting that result. Regression tests: `tests/app.test.js` ("paints the
    query's own result…", "replaces a stale Running… panel…").

- [x] **4.3 — The results live region announces whole tables** — fixed.
  - `#results` was itself `aria-live="polite"` and received an up-to-200-row `<table>`, so a
    screen reader queued the entire table on every Run.
  - Fixed by moving the live region to a dedicated visually-hidden status paragraph that only
    ever receives a one-line summary ("12 rows", the error text); the visible table renders
    outside it. Regression tests: `tests/result-table.test.js` ("announces a short summary,
    never the table itself").

## Known defects (found at the second closeout)

Every one below wants the same discipline as epic 4: a failing test that reproduces it first,
then the fix, then the regression test named in the story.

- [x] **5.1 — One engine load failure bricks the session permanently** — fixed.
  - `db.js:loadSqlJs` memoized `sqlJsPromise` including its _rejection_, so one failed WASM
    fetch bricked every later `createDatabase()` for the rest of the page's life.
  - Fixed by clearing the cache on rejection (`loadSqlJs().catch(() => { sqlJsPromise =
undefined; throw err; })`), so the next call retries the fetch. `warmEngine`'s "the first
    real query pays the cost and reports its own error" comment is now true, since a warm-up
    failure no longer poisons the cache. Regression test: `tests/db.test.js` ("does not brick
    the session after one rejected engine load").

- [x] **5.2 — Submit fails silently when the engine does; Run does not** — fixed.
  - `grader.js:runAgainstFixture` awaited `createSeededDatabase` outside its try, so an engine
    rejection propagated unhandled through `submit()`'s try/finally.
  - Fixed by wrapping the database creation in its own try (rethrowing a distinct, fixture-named
    error) and adding the missing `catch` to `submit()`, which now paints the same designed
    error state `executeQuery` already gives Run. Regression tests: `tests/grader.test.js`,
    `tests/app.test.js` ("shows a designed error state and re-enables the button when grading
    throws").

- [x] **5.3 — The byte counter retains detached digit spans and their timers** — fixed.
  - `byte-counter.js:render` rebuilt on a digit-length change without clearing the timers keyed
    to the spans it just detached, leaking one Map entry per digit-boundary crossing all
    session.
  - Fixed by clearing every pending timer before a length-change rebuild. Regression test:
    `tests/byte-counter.test.js` ("does not leak the roll timer of a digit detached by a length
    change"), using `vi.getTimerCount()`.

- [x] **5.4 — The leaderboard fetch timeout does not cover the response body** — fixed.
  - `remote-leaderboard.js:call` cleared its abort timer as soon as `fetch()` resolved with
    headers, before `fetchTop` read the body — a stalled body never timed out.
  - Fixed by running `readBody` inside the same guarded window as the request; its failures now
    report `MALFORMED` (the request itself succeeded) while an abort at either phase still
    reports `TIMEOUT`. Regression test: `tests/remote-leaderboard.test.js` ("times out a backend
    that stalls the body after resolving headers").

- [x] **5.5 — `refreshBoard()` has no request token, unlike `run`/`submit`** — fixed.
  - Added `latestBoardRequest`, mirroring the results panel's `latestRequest`: only the newest
    `refreshBoard()` call paints. Regression test: `tests/app.test.js` ("does not let an early,
    slower board fetch overwrite a later, faster one").

- [x] **5.6 — `data-reason` is never cleared, so the panel state desyncs** — fixed.
  - `replace()` now deletes `root.dataset.reason` on every transition; `showUnavailable`
    re-adds it after calling `replace` instead of before. Regression test:
    `tests/leaderboard-panel.test.js` ("clears the reason once a later state isn't
    unavailable").

- [x] **5.7 — The win overlay claims modality it does not implement** — fixed.
  - Native `<dialog>`/`showModal()` isn't implemented in this project's jsdom test environment
    (confirmed: `showModal` is `undefined`), so the trap is hand-rolled instead: Tab/Shift+Tab
    wrap at the overlay's first/last controls, and focus that lands outside by any other path
    is pulled back in on the next Tab. Escape and the return-focus-on-close behaviour are
    unchanged. Regression tests: `tests/win-overlay.test.js` ("traps forward Tab…", "traps
    backward Shift+Tab…", "pulls focus back in if it somehow lands outside…").

- [x] **5.8 — Two behaviours silently depend on an unenforced fixture invariant** — fixed.
  - Every puzzle now derives `fixtures[0].setupSql` from the same `previewSetupSql` constant
    instead of retyping it (four of the five had already drifted in whitespace alone); a new
    per-puzzle test in `puzzles.test.js` pins the invariant. `app.js` now keys the visible/hidden
    message off `puzzle.fixtures[0].name` instead of the literal string `"preview"`. Regression
    tests: `tests/puzzles.test.js`, `tests/app.test.js` ("keys the visible-vs-hidden message off
    fixtures[0]…").

### Cleanups worth doing in the same pass

All done in the same pass as 5.1–5.8:

- [x] `el(tag, className, text)` and `prefersReducedMotionByDefault()` extracted into
      `src/ui/dom.js`, imported by every module that used to redefine them.
- [x] `audio.js:toggleMute`'s `this.setMuted(...)` (and the same shape in `result-table.js`'s
      `showResult`/`showEmpty` and `leaderboard-panel.js`'s `showEntries`/`showEmpty`) replaced with
      closures the returned object references directly — safe to destructure.
- [x] `db.js:createSeededDatabase` now closes the database if `run(setupSql)` throws.
- [x] `win-overlay.js`'s copy button now requires `ok === true` before claiming "Copied!".
- [x] `app.js` imports `DEFAULT_LIMIT` from `remote-leaderboard.js` instead of a second
      `BOARD_SIZE` constant.
- [x] The editor hint now advertises both `⌘/Ctrl + Enter to run` and
      `⌘/Ctrl + Shift + Enter to submit`.
- [x] `remote-leaderboard.js:call` no longer returns the unread `status` field.
- [x] `result-table.js` now exposes `destroy()` (cancels the pending flash timer), and
      `app.js`'s `destroy()` calls it alongside its sibling components.
