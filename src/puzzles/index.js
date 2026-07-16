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
 * Today's puzzle is simply the latest one in the list — puzzles are added
 * in order as new days ship.
 * @returns {import("./schema.js").Puzzle}
 */
export function getTodaysPuzzle() {
  return puzzles[puzzles.length - 1];
}
