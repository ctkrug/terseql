// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStreak,
  getBest,
  getCurrentStreak,
  getSolvedCalendarDays,
  getSolvedCount,
  getSolvedPuzzleIds,
  recordSolve,
} from "../src/leaderboard.js";

beforeEach(() => {
  localStorage.clear();
});

describe("recordSolve", () => {
  it("records a first solve", () => {
    recordSolve("2026-07-16", 61, "2026-07-16T10:00:00Z");
    expect(getBest("2026-07-16")).toEqual({
      bytes: 61,
      solvedAt: "2026-07-16T10:00:00Z",
      trail: [61],
    });
  });

  it("builds a trail of improvements, ignoring non-improvements", () => {
    recordSolve("2026-07-16", 96, "a");
    recordSolve("2026-07-16", 74, "b");
    recordSolve("2026-07-16", 88, "c");
    recordSolve("2026-07-16", 61, "d");
    expect(getBest("2026-07-16").trail).toEqual([96, 74, 61]);
  });

  it("migrates a pre-trail stored entry without losing the best", () => {
    // Entries written before trails existed have {bytes, solvedAt} only.
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({ "2026-07-16": { bytes: 80, solvedAt: "old" } }),
    );
    recordSolve("2026-07-16", 61, "new");
    expect(getBest("2026-07-16")).toEqual({ bytes: 61, solvedAt: "new", trail: [80, 61] });
  });

  it("keeps the lower byte count when you golf it down", () => {
    recordSolve("2026-07-16", 61, "2026-07-16T10:00:00Z");
    recordSolve("2026-07-16", 49, "2026-07-16T11:00:00Z");
    expect(getBest("2026-07-16").bytes).toBe(49);
  });

  it("does not regress the best when a later solve is longer", () => {
    recordSolve("2026-07-16", 49, "2026-07-16T10:00:00Z");
    recordSolve("2026-07-16", 80, "2026-07-16T11:00:00Z");
    expect(getBest("2026-07-16").bytes).toBe(49);
  });

  it("keeps an equal-byte resolve from churning the timestamp", () => {
    recordSolve("2026-07-16", 49, "2026-07-16T10:00:00Z");
    recordSolve("2026-07-16", 49, "2026-07-16T11:00:00Z");
    expect(getBest("2026-07-16").solvedAt).toBe("2026-07-16T10:00:00Z");
  });

  it("tracks puzzles independently", () => {
    recordSolve("2026-07-16", 61, "2026-07-16T10:00:00Z");
    recordSolve("2026-07-17", 22, "2026-07-17T10:00:00Z");
    expect(getSolvedCount()).toBe(2);
    expect(getBest("2026-07-17").bytes).toBe(22);
  });
});

describe("getBest", () => {
  it("returns undefined for an unsolved puzzle", () => {
    expect(getBest("2026-07-16")).toBeUndefined();
  });
});

describe("a corrupted store", () => {
  // Everything here is valid JSON, so the parse succeeds and the wrong shape
  // reaches the caller. localStorage is editable by hand and shared with every
  // other script on the origin, so none of this is hypothetical — and all of
  // it runs at mount, where a throw is a white screen rather than a bad value.

  it("survives a store that parsed to null", () => {
    localStorage.setItem("terseql:results", "null");
    expect(getBest("2026-07-16")).toBeUndefined();
    expect(getSolvedPuzzleIds()).toEqual([]);
    expect(getCurrentStreak(new Date("2026-07-16T12:00:00Z"))).toBe(0);
  });

  it("survives a store that parsed to a string", () => {
    localStorage.setItem("terseql:results", '"abc"');
    expect(getSolvedPuzzleIds()).toEqual([]);
    expect(() => recordSolve("2026-07-16", 61, "2026-07-16T10:00:00Z")).not.toThrow();
    expect(getBest("2026-07-16").bytes).toBe(61);
  });

  it("does not read array indices as solved puzzle ids", () => {
    localStorage.setItem("terseql:results", "[1,2,3]");
    expect(getSolvedPuzzleIds()).toEqual([]);
    expect(getSolvedCount()).toBe(0);
  });

  it("discards an entry whose byte count is not a number", () => {
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({ "2026-07-16": { bytes: "junk", trail: "xyz" } }),
    );
    expect(getBest("2026-07-16")).toBeUndefined();
    // ...and a real solve then records cleanly over the junk.
    recordSolve("2026-07-16", 61, "2026-07-16T10:00:00Z");
    expect(getBest("2026-07-16")).toEqual({
      bytes: 61,
      solvedAt: "2026-07-16T10:00:00Z",
      trail: [61],
    });
  });

  it("discards a null entry rather than letting it reach the page", () => {
    localStorage.setItem("terseql:results", JSON.stringify({ "2026-07-16": null }));
    expect(getBest("2026-07-16")).toBeUndefined();
    expect(getSolvedPuzzleIds()).toEqual([]);
  });

  it("repairs a trail that is not an array of numbers", () => {
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({ "2026-07-16": { bytes: 80, solvedAt: "old", trail: "xyz" } }),
    );
    expect(getBest("2026-07-16").trail).toEqual([80]);
    recordSolve("2026-07-16", 61, "new");
    expect(getBest("2026-07-16").trail).toEqual([80, 61]);
  });

  // recordSolve only ever appends a strictly better count, so a real trail
  // descends and ends at `bytes`. A stored one that doesn't is corrupt — and
  // the share card reads the trail, not `bytes`, so an unrepaired one has the
  // player posting a score they never got.
  it("repairs a trail that does not end at the recorded best", () => {
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({ "2026-07-16": { bytes: 61, solvedAt: "x", trail: [10, 20] } }),
    );
    const best = getBest("2026-07-16");
    expect(best.bytes).toBe(61);
    expect(best.trail.at(-1)).toBe(61);
  });

  it("repairs a trail stored out of order", () => {
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({ "2026-07-16": { bytes: 61, solvedAt: "x", trail: [74, 96, 61] } }),
    );
    expect(getBest("2026-07-16").trail).toEqual([96, 74, 61]);
  });

  it("leaves a well-formed trail exactly as written", () => {
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({ "2026-07-16": { bytes: 61, solvedAt: "x", trail: [96, 74, 61] } }),
    );
    expect(getBest("2026-07-16").trail).toEqual([96, 74, 61]);
  });
});

describe("getSolvedCount", () => {
  it("is zero with nothing solved", () => {
    expect(getSolvedCount()).toBe(0);
  });
});

describe("getSolvedPuzzleIds", () => {
  it("returns solved ids in ascending date order", () => {
    recordSolve("2026-07-18", 1, "x");
    recordSolve("2026-07-16", 1, "x");
    recordSolve("2026-07-17", 1, "x");
    expect(getSolvedPuzzleIds()).toEqual(["2026-07-16", "2026-07-17", "2026-07-18"]);
  });
});

describe("getSolvedCalendarDays", () => {
  it("dedupes multiple solves that land on the same real day", () => {
    // Distinct puzzle ids, same real calendar day (e.g. catching up on a
    // missed puzzle and solving today's in the same sitting) — one day.
    recordSolve("2026-07-15", 1, "2026-07-16T09:00:00Z");
    recordSolve("2026-07-16", 1, "2026-07-16T10:00:00Z");
    expect(getSolvedCalendarDays()).toEqual(["2026-07-16"]);
  });

  it("ignores a solvedAt that is not a real ISO date", () => {
    recordSolve("2026-07-16", 1, "not-a-date");
    expect(getSolvedCalendarDays()).toEqual([]);
  });

  it("ignores a solvedAt that is not even a string", () => {
    expect(() => recordSolve("2026-07-16", 1, undefined)).not.toThrow();
    expect(getSolvedCalendarDays()).toEqual([]);
  });

  it("survives a corrupted solved-days store instead of throwing", () => {
    localStorage.setItem("terseql:solved-days", '"not-an-array"');
    expect(() => getSolvedCalendarDays()).not.toThrow();
    expect(getSolvedCalendarDays()).toEqual([]);
  });

  it("survives unparseable JSON in the solved-days store", () => {
    localStorage.setItem("terseql:solved-days", "{not json");
    expect(() => getSolvedCalendarDays()).not.toThrow();
    expect(getSolvedCalendarDays()).toEqual([]);
  });

  it("survives a write failure (private mode, quota exceeded) without throwing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => recordSolve("2026-07-16", 1, "2026-07-16T10:00:00Z")).not.toThrow();
    setItem.mockRestore();
    expect(getSolvedCalendarDays()).toEqual([]);
  });

  it("drops non-date entries from a hand-edited solved-days store", () => {
    localStorage.setItem(
      "terseql:solved-days",
      JSON.stringify(["2026-07-16", 42, null, "garbage", "2026-07-17"]),
    );
    expect(getSolvedCalendarDays()).toEqual(["2026-07-16", "2026-07-17"]);
  });
});

describe("computeStreak", () => {
  it("is zero with no solves", () => {
    expect(computeStreak([], "2026-07-16")).toBe(0);
  });

  it("counts a single solve today as 1", () => {
    expect(computeStreak(["2026-07-16"], "2026-07-16")).toBe(1);
  });

  it("counts consecutive days", () => {
    const days = ["2026-07-14", "2026-07-15", "2026-07-16"];
    expect(computeStreak(days, "2026-07-16")).toBe(3);
  });

  it("resets to 1 after a gap day rather than continuing the old run", () => {
    // Solved the 12th, 13th, 14th — missed the 15th — solved the 16th.
    // The old three-day run is dead; today starts a fresh streak of 1.
    const days = ["2026-07-12", "2026-07-13", "2026-07-14", "2026-07-16"];
    expect(computeStreak(days, "2026-07-16")).toBe(1);
  });

  it("survives today being unsolved so long as yesterday was solved", () => {
    // Mid-morning, before you've done today's puzzle, the streak still shows.
    expect(computeStreak(["2026-07-14", "2026-07-15"], "2026-07-16")).toBe(2);
  });

  it("is zero once a whole day passes with nothing solved", () => {
    expect(computeStreak(["2026-07-14"], "2026-07-16")).toBe(0);
  });

  it("ignores solves dated in the future", () => {
    expect(computeStreak(["2026-07-20"], "2026-07-16")).toBe(0);
  });

  it("counts a run that spans a month boundary", () => {
    const days = ["2026-06-29", "2026-06-30", "2026-07-01"];
    expect(computeStreak(days, "2026-07-01")).toBe(3);
  });

  it("counts a run that spans a leap day", () => {
    const days = ["2028-02-28", "2028-02-29", "2028-03-01"];
    expect(computeStreak(days, "2028-03-01")).toBe(3);
  });

  it("does not double-count duplicate dates", () => {
    expect(computeStreak(["2026-07-16", "2026-07-16"], "2026-07-16")).toBe(1);
  });

  it("is order-independent", () => {
    const shuffled = ["2026-07-16", "2026-07-14", "2026-07-15"];
    expect(computeStreak(shuffled, "2026-07-16")).toBe(3);
  });
});

describe("getCurrentStreak", () => {
  it("reads the streak out of recorded solves", () => {
    recordSolve("2026-07-15", 40, "2026-07-15T10:00:00Z");
    recordSolve("2026-07-16", 38, "2026-07-16T10:00:00Z");
    expect(getCurrentStreak(new Date("2026-07-16T12:00:00Z"))).toBe(2);
  });

  it("is zero for a player who has never solved anything", () => {
    expect(getCurrentStreak(new Date("2026-07-16T12:00:00Z"))).toBe(0);
  });

  it("keeps growing across real days that reuse the same puzzle id", () => {
    // getPuzzleForDate falls back to the most recent authored puzzle once the
    // catalogue runs dry, so several real calendar days in a row can all solve
    // under the identical stale puzzle id. The streak has to track the days the
    // player actually played, not which puzzle id happened to be on screen —
    // otherwise it goes permanently stuck at 1 (or dies) the moment the
    // catalogue runs out, even though the player kept a solve every day.
    recordSolve("2026-07-20", 50, "2026-07-21T10:00:00Z");
    recordSolve("2026-07-20", 50, "2026-07-22T10:00:00Z");
    recordSolve("2026-07-20", 50, "2026-07-23T10:00:00Z");
    expect(getCurrentStreak(new Date("2026-07-23T12:00:00Z"))).toBe(3);
  });

  it("breaks like any other streak once a real day is skipped", () => {
    recordSolve("2026-07-20", 50, "2026-07-20T10:00:00Z");
    recordSolve("2026-07-20", 50, "2026-07-23T10:00:00Z");
    expect(getCurrentStreak(new Date("2026-07-23T12:00:00Z"))).toBe(1);
  });
});
