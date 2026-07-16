const STORAGE_KEY = "terseql:results";

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    // localStorage unavailable (private mode, SSR, tests) — behave as empty
    return {};
  }
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
    store[puzzleId] = { bytes, solvedAt, trail: [...(existing.trail ?? [existing.bytes]), bytes] };
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
