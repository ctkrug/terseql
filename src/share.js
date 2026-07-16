const MAX_BLOCKS = 10;
const BLOCK = "🟦";
const BEST_BLOCK = "🟩";

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

  trail.forEach((bytes, i) => {
    const isBest = i === trail.length - 1;
    lines.push(`${bar(bytes, worst, isBest)} ${bytes}`);
  });

  lines.push("");
  lines.push(`${best} bytes${trail.length > 1 ? ` (${trail.length} cuts)` : ""}`);
  if (streak >= 2) lines.push(`🔥 ${streak}-day streak`);
  lines.push(url);

  return lines.join("\n");
}
