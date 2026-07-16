const STORAGE_KEY = "terseql:results";

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

/**
 * Record a passing solve for a puzzle, keeping the player's best (lowest)
 * byte count.
 *
 * Alongside the best, this keeps a `trail` of every byte count that was an
 * improvement at the time — the staircase of a player golfing 96 → 74 → 61.
 * It's what the share card renders, and it's the shape of the game, so it's
 * worth persisting rather than holding in page memory that a reload drops.
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
  return store[puzzleId];
}

/**
 * @param {string} puzzleId
 * @returns {{bytes: number, solvedAt: string} | undefined}
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
 * streak is 0. Solves are keyed by puzzle id, which is the puzzle's UTC
 * calendar date, so this is pure string date arithmetic with no timezone.
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
 * The player's current solve streak in days.
 * @param {Date} [now]
 * @returns {number}
 */
export function getCurrentStreak(now = new Date()) {
  return computeStreak(getSolvedPuzzleIds(), now.toISOString().slice(0, 10));
}
