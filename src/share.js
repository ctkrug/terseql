const MAX_BLOCKS = 10;
const MAX_ROWS = 8;
const BLOCK = "🟦";
const BEST_BLOCK = "🟩";
const ELISION = "⋯";

export const SHARE_URL = "https://apps.charliekrug.com/terseql";

/**
 * Render one byte count as a bar, scaled against the worst count in the trail
 * so the staircase always starts full-width and visibly shrinks. The best row
 * is green — it's where you landed.
 * @param {number} bytes
 * @param {number} worst
 * @param {boolean} isBest
 */
function bar(bytes, worst, isBest) {
  const ratio = worst > 0 ? bytes / worst : 1;
  const blocks = Math.max(1, Math.min(MAX_BLOCKS, Math.round(ratio * MAX_BLOCKS)));
  return (isBest ? BEST_BLOCK : BLOCK).repeat(blocks);
}

/**
 * Pick the rows worth showing from a trail of any length.
 *
 * A golfer trimming one byte at a time can rack up 20+ improvements, and a
 * card is made to be pasted into a group chat — a row per cut is a wall, not
 * a glance. Where you started and where you landed carry the story; the
 * middle is decoration, so the tail (the hard-won last cuts) survives and the
 * rest collapses. The "N cuts" summary still reports the real count.
 *
 * @param {number[]} trail
 * @returns {Array<number|typeof ELISION>}
 */
function visibleRows(trail) {
  if (trail.length <= MAX_ROWS) return trail;
  return [trail[0], ELISION, ...trail.slice(-(MAX_ROWS - 2))];
}

/**
 * Format a Wordle-style share card for a solved puzzle: plain text and emoji
 * only, no image, and — critically — no query text. The card shows how far
 * you golfed, never how you did it, so pasting it in a group chat can't spoil
 * the day's puzzle for anyone.
 *
 * @param {Object} params
 * @param {string} params.puzzleId - ISO date, e.g. "2026-07-16"
 * @param {string} params.title
 * @param {number[]} params.trail - improving byte counts, worst to best
 * @param {number} [params.streak] - current streak in days; omitted if < 2
 * @param {string} [params.url]
 * @returns {string}
 */
export function formatShareCard({ puzzleId, title, trail, streak = 0, url = SHARE_URL }) {
  if (!Array.isArray(trail) || trail.length === 0) {
    throw new Error("formatShareCard needs at least one byte count in the trail");
  }

  const worst = trail[0];
  const best = trail[trail.length - 1];
  const lines = [`Terseql ${puzzleId} — ${title}`, ""];

  const rows = visibleRows(trail);
  rows.forEach((bytes, i) => {
    if (bytes === ELISION) {
      lines.push(ELISION);
      return;
    }
    const isBest = i === rows.length - 1;
    lines.push(`${bar(bytes, worst, isBest)} ${bytes}`);
  });

  lines.push("");
  lines.push(`${best} bytes${trail.length > 1 ? ` (${trail.length} cuts)` : ""}`);
  if (streak >= 2) lines.push(`🔥 ${streak}-day streak`);
  lines.push(url);

  return lines.join("\n");
}
