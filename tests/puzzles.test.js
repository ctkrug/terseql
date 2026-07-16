import { describe, expect, it } from "vitest";
import { gradeQuery, runAgainstFixture } from "../src/grader.js";
import { dayOne } from "../src/puzzles/day-0001.js";
import {
  puzzles,
  getPuzzleById,
  getPuzzleForDate,
  getTodaysPuzzle,
  isoDate,
} from "../src/puzzles/index.js";
import { validatePuzzle } from "../src/puzzles/schema.js";

// Every authored puzzle is held to the same bar: well-formed, enough hidden
// coverage to be ungameable, and a reference solution that actually produces
// every `expected` it ships. A puzzle whose own answer doesn't match its
// fixtures is unsolvable, so this guards the whole catalogue, not just day one.
describe.each(puzzles.map((p) => [p.id, p]))("puzzle %s", (_id, puzzle) => {
  it("is well-formed", () => {
    expect(validatePuzzle(puzzle)).toEqual([]);
  });

  it("ships a reference solution", () => {
    expect(puzzle.referenceSql?.trim()).toBeTruthy();
  });

  it("has at least 3 fixtures, including hidden ones beyond the preview", () => {
    expect(puzzle.fixtures.length).toBeGreaterThanOrEqual(3);
    expect(puzzle.fixtures.filter((f) => f.name !== "preview").length).toBeGreaterThanOrEqual(2);
  });

  it("uses its id as a valid ISO calendar date", () => {
    expect(puzzle.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(`${puzzle.id}T00:00:00Z`))).toBe(false);
  });

  it("grades its own reference solution as correct", async () => {
    const result = await gradeQuery(puzzle.referenceSql, puzzle);
    expect(result.failedFixture).toBeNull();
    expect(result.correct).toBe(true);
  });

  it.each(puzzle.fixtures.map((f) => [f.name, f]))(
    "fixture %s matches the reference solution",
    async (_name, fixture) => {
      const passed = await runAgainstFixture(puzzle.referenceSql, fixture);
      expect(passed).toBe(true);
    },
  );
});

describe("puzzle catalogue", () => {
  it("has no duplicate ids", () => {
    const ids = puzzles.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps day-0001 in the registry", () => {
    expect(puzzles).toContain(dayOne);
  });
});

describe("puzzle registry", () => {
  it("looks puzzles up by id", () => {
    expect(getPuzzleById(dayOne.id)).toBe(dayOne);
    expect(getPuzzleById("nonexistent")).toBeUndefined();
  });

  it("always resolves some puzzle for the real current date", () => {
    expect(getTodaysPuzzle()).toBeDefined();
  });
});

describe("daily rotation", () => {
  const sorted = [...puzzles].sort((a, b) => a.id.localeCompare(b.id));

  it("uses the UTC calendar date, not local time", () => {
    // 23:30 UTC-relative instants that fall on different local days
    expect(isoDate(new Date("2026-07-16T23:30:00Z"))).toBe("2026-07-16");
    expect(isoDate(new Date("2026-07-17T00:30:00Z"))).toBe("2026-07-17");
  });

  it("resolves different dates to different puzzles when both exist", () => {
    expect(puzzles.length).toBeGreaterThan(1);
    const first = sorted[0];
    const second = sorted[1];

    expect(getPuzzleForDate(new Date(`${first.id}T12:00:00Z`))).toBe(first);
    expect(getPuzzleForDate(new Date(`${second.id}T12:00:00Z`))).toBe(second);
    expect(getPuzzleForDate(new Date(`${first.id}T12:00:00Z`))).not.toBe(
      getPuzzleForDate(new Date(`${second.id}T12:00:00Z`)),
    );
  });

  it("matches by id rather than array position", () => {
    for (const puzzle of puzzles) {
      expect(getPuzzleForDate(new Date(`${puzzle.id}T00:00:00Z`))).toBe(puzzle);
    }
  });

  it("falls back to the most recent past puzzle on an unauthored day", () => {
    const latest = sorted[sorted.length - 1];
    const wayLater = new Date("2099-01-01T00:00:00Z");
    expect(getPuzzleForDate(wayLater)).toBe(latest);
  });

  it("never serves a future-dated puzzle early", () => {
    const first = sorted[0];
    const dayBefore = new Date(`${first.id}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    expect(getPuzzleForDate(dayBefore)).toBeUndefined();
  });

  it("still returns a playable puzzle before the first authored day", () => {
    const first = sorted[0];
    const dayBefore = new Date(`${first.id}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    expect(getTodaysPuzzle(dayBefore)).toBe(first);
  });
});
