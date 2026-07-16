# Terseql — backlog

Epics are ordered; within an epic, stories are roughly build order. Every story has concrete,
verifiable acceptance criteria — a later run should be able to check each one true/false.

## Epic 1 — Core solve loop

The wow moment: writing SQL, watching it execute live against a real database, and watching the
byte count fall as you trim the query.

- [ ] **1.1 — Live query execution against a real in-browser database (WOW MOMENT)**
  - Typing a query and clicking Run executes it via sql.js against the puzzle's preview
    database and renders an HTML result table within 200ms of clicking Run.
  - The byte counter updates on every keystroke in the editor, computed via `TextEncoder`
    UTF-8 length (not character count).
  - A syntactically invalid query shows an inline error message in the results area instead of
    throwing an uncaught exception.

- [ ] **1.2 — Hidden fixture grading**
  - Submitting a query runs it against every fixture in `puzzle.fixtures` (not just the
    preview) and only marks the puzzle solved if all pass.
  - A query that matches the preview's visible sample data but fails a hidden fixture is
    reported as incorrect.
  - `gradeQuery()` has unit test coverage proving a hardcoded-rows query fails a hidden
    fixture even though it matches the preview (baseline already in `tests/grader.test.js`).

- [ ] **1.3 — Live byte counter juice**
  - When the byte count changes, the digit(s) that changed animate with a roll transition
    (90ms ease-out per `docs/DESIGN.md`) rather than snapping instantly.
  - The roll animation is replaced with an instant update when `prefers-reduced-motion` is set.

- [ ] **1.4 — Win celebration**
  - Passing a query for the first time on a puzzle shows an overlay with byte count,
    personal-best delta, and a "Copy share card" button.
  - Clicking "Copy share card" copies a Wordle-style emoji/text grid (no image) to the
    clipboard.
  - The overlay is dismissible (Escape key or close button) without losing the solved state.

- [ ] **1.5 — Design polish pass: core solve loop**
  - Editor, Run button, and result table match `docs/DESIGN.md` tokens (colors, fonts, radius,
    shadow/glow).
  - Every interactive control (Run button, editor) has themed hover/focus-visible/active
    states — no unstyled native defaults.

## Epic 2 — Daily puzzles & leaderboard

- [ ] **2.1 — Deterministic daily puzzle rotation**
  - `getTodaysPuzzle()` resolves the puzzle by matching the current calendar date (UTC) to a
    puzzle id, not by array position, and falls back to the most recent past puzzle if there's
    no exact match for today.
  - A unit test proves two different mocked "current dates" resolve to two different puzzles
    when both exist in the registry.

- [ ] **2.2 — Five hand-authored puzzles**
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

- [ ] **2.4 — Streak tracking**
  - `getSolvedCount()` / a new `getCurrentStreak()` are covered by unit tests, including a
    broken-streak case (a gap day resets the streak to 1, not continues it).
  - The current streak count is surfaced somewhere visible on the puzzle page.

- [ ] **2.5 — Design polish pass: daily puzzles & leaderboard**
  - Leaderboard panel and streak indicator use `docs/DESIGN.md`'s support-accent (amber) token
    for "your best," not the primary accent — per the tokens table.
  - The leaderboard's empty state (no submissions yet / backend unreachable) is a designed
    state, not a blank area.

## Epic 3 — Polish, accessibility & landing page

- [ ] **3.1 — Responsive layout**
  - Page renders with no horizontal scroll and no overlapping elements at 390px, 768px, and
    1440px viewport widths.
  - At 1440px, the editor+results column occupies ≥55% of viewport width, per
    `docs/DESIGN.md`'s layout intent.

- [ ] **3.2 — Sound design**
  - The keystroke/run/fail/pass/win SFX listed in `docs/DESIGN.md` are implemented via
    WebAudio oscillators/noise — zero binary audio files in the repo.
  - A mute toggle exists, its state persists across reloads via `localStorage`, and the
    `AudioContext` is created lazily on first user gesture, not on page load.

- [ ] **3.3 — Accessibility pass**
  - All icon-only buttons (e.g. the mute toggle) have an `aria-label`; the results area is an
    `aria-live` region that announces pass/fail state changes.
  - Every interactive element is reachable and operable via Tab + Enter/Space alone, with a
    visible focus ring.

- [ ] **3.4 — Landing/marketing page**
  - A `site/` directory contains a static landing page using the same `docs/DESIGN.md` tokens
    and fonts as the app, buildable to one output directory with relative asset paths.
  - The landing page includes a favicon matching the app's and no placeholder/lorem-ipsum copy.
