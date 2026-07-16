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
 * Record a passing solve for a puzzle, keeping only the player's best
 * (lowest) byte count per puzzle.
 * @param {string} puzzleId
 * @param {number} bytes
 * @param {string} solvedAt - ISO date string
 */
export function recordSolve(puzzleId, bytes, solvedAt) {
  const store = readStore();
  const existing = store[puzzleId];
  if (!existing || bytes < existing.bytes) {
    store[puzzleId] = { bytes, solvedAt };
    writeStore(store);
  }
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
