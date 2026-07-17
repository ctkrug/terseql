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

- [ ] **5.1 — One engine load failure bricks the session permanently**
  - `db.js:loadSqlJs` memoizes `sqlJsPromise` including its _rejection_. If the ~660KB WASM
    fetch fails once (a mobile blip, a CDN hiccup), every later `createDatabase()` re-returns
    that same rejection for the life of the page. Nothing retries; only a reload recovers.
  - `warmEngine()` makes this worse and its docstring is false: it promises "this is a head
    start, not a dependency… if it fails, the first real query pays the cost and reports its
    own error." Because it front-runs the load at mount and swallows the error, it is exactly
    what can poison the cache before the player runs anything.
  - Acceptance: a test where the first `initSqlJs` rejects and the second resolves proves a
    subsequent `createDatabase()` succeeds. `warmEngine`'s comment matches what the code does.

- [ ] **5.2 — Submit fails silently when the engine does; Run does not**
  - `grader.js:runAgainstFixture` awaits `createSeededDatabase` _outside_ its try, so an engine
    rejection propagates through `gradeQuery` into `submit()`, which has `try/finally` but no
    `catch`. The `finally` restores the button, the rejection escapes the click handler
    unhandled, and the player sees "Grading…" flip back to "Submit" with no message, forever.
  - `executeQuery` catches everything, so Run degrades to a designed error state. The
    asymmetry is backwards: the scored action is the unprotected one.
  - Acceptance: with a failing engine, Submit renders a designed error state and raises no
    unhandled rejection. `runAgainstFixture` closes its db on every path.

- [ ] **5.3 — The byte counter retains detached digit spans and their timers**
  - `byte-counter.js:render` rebuilds on a digit-length change with `root.textContent = ""`,
    but never clears the pending timers keyed to the spans it just detached. The `timers` Map
    holds dead nodes and their callbacks still fire against them. Crossing digit boundaries is
    the normal shape of golfing (126 → 99 → 101 → 96), so it accumulates all session, in the
    one component `docs/DESIGN.md` calls the signature detail.
  - Acceptance: a test proves the Map does not grow across repeated length changes.

- [ ] **5.4 — The leaderboard fetch timeout does not cover the response body**
  - `remote-leaderboard.js:call` clears the abort timer in its `finally` and returns, but
    `fetchTop` reads `await result.response.json()` after that. A server that sends headers and
    then stalls the body never aborts and never times out; the board sits on "Loading today's
    board…" forever. `timeoutMs` only really covers headers.
  - Dormant at ship (no `VITE_LEADERBOARD_URL` is configured, so the client is disabled), which
    is why it isn't a live bug today — and exactly why it should be fixed before 2.3 makes it
    one. Same for 5.5 and 5.6.
  - Acceptance: a fake backend that resolves headers but never the body resolves to `timeout`.

- [ ] **5.5 — `refreshBoard()` has no request token, unlike `run`/`submit`**
  - The mount-time `refreshBoard()` can still be in flight when a fast solve fires the
    post-submit one; responses can land out of order and the stale one paints last. This is the
    race `latestRequest` already solves for the results panel — the board just never got it.
  - Acceptance: a test where an early, slower board fetch cannot overwrite a later one.

- [ ] **5.6 — `data-reason` is never cleared, so the panel state desyncs**
  - `leaderboard-panel.js:showUnavailable` sets `root.dataset.reason`; `showLoading`,
    `showEntries` and `showEmpty` never clear it. An offline refresh followed by a good one
    leaves `data-state="entries" data-reason="network"` — an attribute contradicting the state,
    and a trap for any CSS or test keyed to it.
  - Acceptance: reason is absent in every state that isn't "unavailable".

- [ ] **5.7 — The win overlay claims modality it does not implement**
  - `win-overlay.js` sets `aria-modal="true"` but there is no focus trap and the background is
    not inert, so Tab walks straight out into the editor behind an overlay still covering the
    page. `aria-modal` promises assistive tech precisely the thing that isn't true. It also
    hardcodes the global id `win-title`.
  - A native `<dialog>` + `showModal()` would provide the trap, Escape handling and inertness,
    and would retire the manual `onKeydown`. Worth doing rather than hand-rolling a trap.
  - Acceptance: focus cannot leave the open overlay by keyboard; Escape still closes it and
    restores focus to the editor (the existing behaviour, kept).

- [ ] **5.8 — Two behaviours silently depend on an unenforced fixture invariant**
  - Every puzzle duplicates `previewSetupSql` verbatim into `fixtures[0].setupSql` and names
    that fixture `"preview"`. Nothing enforces either half, and two things quietly rely on it:
    `app.js` picks the "wrong on the sample you can see" vs "fails a hidden case" message by
    comparing `failedFixture === "preview"` (a magic string, while `schema.js` defines the
    convention _positionally_), and the passing-submit re-run only paints when `preview.ok` —
    if the two ever diverge, a passing Submit flashes green over a stale "Running…", which is
    defect 4.2 returning through the back door.
  - Acceptance: the invariant is enforced (a test asserting `previewSetupSql` equals
    `fixtures[0].setupSql` for every puzzle, or the fixture derives from it), and the visible
    vs hidden message keys off `fixtures[0]` rather than the name `"preview"`.

### Cleanups worth doing in the same pass

- `el(tag, className, text)` is duplicated verbatim in `ui/leaderboard-panel.js`,
  `ui/result-table.js` and `ui/win-overlay.js`; `prefersReducedMotionByDefault()` is duplicated
  between `ui/byte-counter.js` and `ui/win-overlay.js`. Extract a `ui/dom.js`.
- `audio.js:toggleMute` uses `this` inside an object literal whose every other member closes
  over module scope, so `const { toggleMute } = sfx` breaks — in a module explicitly built to be
  injected and destructured. Same shape in `result-table.js` and `leaderboard-panel.js`.
- `db.js:createSeededDatabase` leaks the database if `run(setupSql)` throws (unguarded).
- `win-overlay.js` reports "Copied!" when `onCopyShare` is absent (`undefined !== false`).
  Prefer `ok === true ? "Copied!" : "Copy failed"`.
- `app.js:BOARD_SIZE` and `remote-leaderboard.js:DEFAULT_LIMIT` are two constants for one
  concept that must agree.
- The editor hint advertises "⌘/Ctrl + Enter to run" but never mentions ⌘/Ctrl+Shift+Enter for
  Submit — the scored action is the undiscoverable one.
- `remote-leaderboard.js:call` returns a `status` field neither caller reads.
- `result-table.js` has no `destroy()`, though `flash()` leaves a 600ms `setTimeout` against the
  root; its two sibling components both expose one and `app.destroy()` calls them.
