import { describe, expect, it } from "vitest";
import { runAgainstFixture } from "../src/grader.js";
import { dayOne } from "../src/puzzles/day-0001.js";
import { puzzles, getPuzzleById, getTodaysPuzzle } from "../src/puzzles/index.js";
import { validatePuzzle } from "../src/puzzles/schema.js";

describe("day-0001 fixtures", () => {
  it("is well-formed", () => {
    expect(validatePuzzle(dayOne)).toEqual([]);
  });

  it.each(dayOne.fixtures.map((f) => [f.name, f]))(
    "fixture %s matches the reference solution",
    async (_name, fixture) => {
      const passed = await runAgainstFixture(dayOne.referenceSql, fixture);
      expect(passed).toBe(true);
    },
  );
});

describe("puzzle registry", () => {
  it("looks puzzles up by id", () => {
    expect(getPuzzleById(dayOne.id)).toBe(dayOne);
    expect(getPuzzleById("nonexistent")).toBeUndefined();
  });

  it("treats the last puzzle in the list as today's", () => {
    expect(getTodaysPuzzle()).toBe(puzzles[puzzles.length - 1]);
  });
});
