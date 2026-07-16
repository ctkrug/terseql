import { dayOne } from "./day-0001.js";

/** @type {import("./schema.js").Puzzle[]} */
export const puzzles = [dayOne];

/**
 * @param {string} id
 * @returns {import("./schema.js").Puzzle | undefined}
 */
export function getPuzzleById(id) {
  return puzzles.find((puzzle) => puzzle.id === id);
}

/**
 * The calendar date (UTC) a puzzle belongs to, as an ISO `YYYY-MM-DD` string.
 * UTC — not local time — so every player worldwide is solving the same puzzle
 * on the same leaderboard at the same moment.
 * @param {Date} [now]
 * @returns {string}
 */
export function isoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Resolve the puzzle for a given day by matching its id to the UTC calendar
 * date. If no puzzle is authored for that exact date, fall back to the most
 * recent past puzzle — a missed day shows yesterday's puzzle rather than a
 * broken page. Future-dated puzzles are never served early.
 * @param {Date} [now]
 * @returns {import("./schema.js").Puzzle | undefined}
 */
export function getPuzzleForDate(now = new Date()) {
  const today = isoDate(now);
  const exact = getPuzzleById(today);
  if (exact) return exact;

  const past = puzzles
    .filter((puzzle) => puzzle.id <= today)
    .sort((a, b) => a.id.localeCompare(b.id));
  return past[past.length - 1];
}

/**
 * Today's puzzle. Falls back to the earliest authored puzzle when the whole
 * catalogue is still in the future (i.e. before launch day) so the page is
 * always playable.
 * @param {Date} [now]
 * @returns {import("./schema.js").Puzzle}
 */
export function getTodaysPuzzle(now = new Date()) {
  return getPuzzleForDate(now) ?? [...puzzles].sort((a, b) => a.id.localeCompare(b.id))[0];
}
