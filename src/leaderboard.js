const STORAGE_KEY = "terseql:results";
const STREAK_KEY = "terseql:solved-days";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce one stored entry to the shape the rest of the module promises, or
 * drop it. A byte count is a positive integer by construction, so anything
 * else means the entry was written by something other than `recordSolve`.
 *
 * @returns {{bytes: number, solvedAt: string, trail: number[]} | null}
 */
function sanitizeEntry(entry) {
  if (!isPlainObject(entry)) return null;
  if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) return null;

  // recordSolve only ever appends a strictly better count, so a real trail
  // descends and ends at `bytes`. Rebuild that invariant rather than trust
  // it: the share card reads the trail, so a stored one that ends anywhere
  // else has the player posting a score they never got. Dropping anything not
  // better than `bytes` and re-sorting makes this idempotent — a well-formed
  // trail survives untouched, and any other shape collapses to the best
  // staircase the entry can still justify.
  const steps = Array.isArray(entry.trail)
    ? entry.trail.filter((bytes) => Number.isInteger(bytes) && bytes > entry.bytes)
    : [];

  return {
    bytes: entry.bytes,
    solvedAt: typeof entry.solvedAt === "string" ? entry.solvedAt : "",
    // No usable trail (an entry written before trails existed, or a corrupt
    // one) still has a best, which is a one-step staircase.
    trail: [...steps.sort((a, b) => b - a), entry.bytes],
  };
}

/**
 * The player's results, guaranteed to be an object of well-formed entries.
 *
 * `JSON.parse` succeeding proves nothing about shape: `"null"`, `"[1,2,3]"`
 * and `'"abc"'` are all valid JSON, and localStorage is hand-editable and
 * shared with every other script on the origin. This runs at mount, so an
 * unchecked shape here is a white page rather than a wrong number.
 */
function readStore() {
  let parsed;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    // Unreadable or not JSON: localStorage unavailable (private mode, SSR,
    // tests), or the value was overwritten with something else entirely.
    return {};
  }

  if (!isPlainObject(parsed)) return {};

  const store = {};
  for (const [puzzleId, entry] of Object.entries(parsed)) {
    const clean = sanitizeEntry(entry);
    if (clean) store[puzzleId] = clean;
  }
  return store;
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best-effort; a failed write just means this result isn't persisted
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every distinct calendar day (UTC) the player has recorded a solve on,
 * ascending. Sanitized the same way `readStore` is: hand-editable, shared
 * storage means a malformed value here should be dropped, not thrown on.
 * @returns {string[]}
 */
function readSolvedDays() {
  let parsed;
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const days = new Set(parsed.filter((day) => typeof day === "string" && ISO_DAY.test(day)));
  return [...days].sort();
}

function addSolvedDay(solvedAt) {
  const day = typeof solvedAt === "string" ? solvedAt.slice(0, 10) : "";
  if (!ISO_DAY.test(day)) return;
  const days = new Set(readSolvedDays());
  days.add(day);
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify([...days].sort()));
  } catch {
    // best-effort; a failed write just means today doesn't extend the streak
  }
}

/**
 * Record a passing solve for a puzzle, keeping the player's best (lowest)
 * byte count.
 *
 * Alongside the best, this keeps a `trail` of every byte count that was an
 * improvement at the time — the staircase of a player golfing 96 → 74 → 61.
 * It's what the share card renders, and it's the shape of the game, so it's
 * worth persisting rather than holding in page memory that a reload drops.
 *
 * Every correct solve also extends the calendar-day streak record,
 * independent of and unconditional on whether it improved this puzzle's
 * best. Puzzle ids are NOT reliable as calendar days for this purpose:
 * `getPuzzleForDate` re-serves the most recent authored puzzle once the
 * catalogue runs dry, so several distinct real days can share one puzzle
 * id, and keying streaks off puzzle ids would make the streak die (or get
 * stuck) the moment that happens. `solvedAt` is always the real wall-clock
 * day the player played, so that's what the streak is built from.
 *
 * @param {string} puzzleId
 * @param {number} bytes
 * @param {string} solvedAt - ISO date string
 * @returns {{bytes: number, solvedAt: string, trail: number[]}}
 */
export function recordSolve(puzzleId, bytes, solvedAt) {
  const store = readStore();
  const existing = store[puzzleId];
  if (!existing) {
    store[puzzleId] = { bytes, solvedAt, trail: [bytes] };
  } else if (bytes < existing.bytes) {
    // readStore guarantees a trail, including for entries written before
    // trails existed — no need to reconstruct one here.
    store[puzzleId] = { bytes, solvedAt, trail: [...existing.trail, bytes] };
  }
  writeStore(store);
  addSolvedDay(solvedAt);
  return store[puzzleId];
}

/**
 * The player's best result for a puzzle, or undefined if they haven't solved
 * it. `readStore` sanitizes, so a returned entry always carries a descending
 * `trail` ending at `bytes` — callers need no fallback of their own.
 *
 * @param {string} puzzleId
 * @returns {{bytes: number, solvedAt: string, trail: number[]} | undefined}
 */
export function getBest(puzzleId) {
  return readStore()[puzzleId];
}

/**
 * @returns {number} count of distinct puzzles solved
 */
export function getSolvedCount() {
  return Object.keys(readStore()).length;
}

/**
 * Every solved puzzle id (an ISO `YYYY-MM-DD` date), ascending.
 * @returns {string[]}
 */
export function getSolvedPuzzleIds() {
  return Object.keys(readStore()).sort();
}

function previousDay(isoDay) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Length of the current run of consecutive solved days, counting back from
 * `today`.
 *
 * A streak stays alive while today's puzzle is still unsolved — it's only
 * broken once a day passes with nothing solved — so the most recent solve may
 * be today OR yesterday. Anything older means the run already ended and the
 * streak is 0.
 *
 * Days in, days out: the caller passes the real calendar days a solve was
 * recorded on (see `recordSolve` for why those are not puzzle ids), already
 * normalized to UTC `YYYY-MM-DD`, so this is pure string date arithmetic with
 * no timezone of its own.
 *
 * @param {string[]} solvedDates - ISO `YYYY-MM-DD` strings, any order
 * @param {string} today - ISO `YYYY-MM-DD`
 * @returns {number}
 */
export function computeStreak(solvedDates, today) {
  const solved = new Set(solvedDates);
  if (!solved.size) return 0;

  let cursor = solved.has(today) ? today : previousDay(today);
  if (!solved.has(cursor)) return 0;

  let streak = 0;
  while (solved.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/**
 * Every distinct calendar day (UTC) the player has recorded a correct solve
 * on, ascending. This is what streaks are built from — see the note on
 * `recordSolve` for why it's tracked separately from puzzle ids.
 * @returns {string[]}
 */
export function getSolvedCalendarDays() {
  return readSolvedDays();
}

/**
 * The player's current solve streak in days.
 * @param {Date} [now]
 * @returns {number}
 */
export function getCurrentStreak(now = new Date()) {
  return computeStreak(getSolvedCalendarDays(), now.toISOString().slice(0, 10));
}
