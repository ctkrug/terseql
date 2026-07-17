import { describe, expect, it, vi } from "vitest";
import { byteLength, gradeQuery, resultSetsEqual, runAgainstFixture } from "../src/grader.js";
import { dayOne } from "../src/puzzles/day-0001.js";

vi.mock("../src/db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createSeededDatabase: vi.fn(actual.createSeededDatabase) };
});

import { createSeededDatabase } from "../src/db.js";

describe("byteLength", () => {
  it("counts ASCII characters as one byte each", () => {
    expect(byteLength("SELECT 1")).toBe(8);
  });

  it("counts multi-byte UTF-8 characters by their encoded size, not char count", () => {
    // "é" is 1 JS char but 2 UTF-8 bytes — a query can't shave bytes by
    // swapping in exotic characters that look shorter than they score.
    expect(byteLength("é")).toBe(2);
  });

  it("treats an empty string as zero bytes", () => {
    expect(byteLength("")).toBe(0);
  });
});

describe("resultSetsEqual", () => {
  const base = { columns: ["a"], values: [[1]] };

  it("matches identical result sets", () => {
    expect(resultSetsEqual(base, { columns: ["a"], values: [[1]] })).toBe(true);
  });

  it("rejects a different row count", () => {
    expect(resultSetsEqual(base, { columns: ["a"], values: [[1], [2]] })).toBe(false);
  });

  it("rejects a different column count", () => {
    expect(resultSetsEqual(base, { columns: ["a", "b"], values: [[1, 2]] })).toBe(false);
  });

  it("rejects mismatched values", () => {
    expect(resultSetsEqual(base, { columns: ["a"], values: [[2]] })).toBe(false);
  });

  it("ignores column names so golfers aren't taxed for aliases", () => {
    expect(resultSetsEqual(base, { columns: ["totally_different"], values: [[1]] })).toBe(true);
  });

  it("respects column order", () => {
    const twoCols = { columns: ["a", "b"], values: [[1, 2]] };
    expect(resultSetsEqual(twoCols, { columns: ["a", "b"], values: [[2, 1]] })).toBe(false);
  });

  it("matches two empty result sets", () => {
    expect(resultSetsEqual({ columns: [], values: [] }, { columns: [], values: [] })).toBe(true);
  });

  it("rejects a null or undefined side against a real result set", () => {
    expect(resultSetsEqual(null, base)).toBe(false);
    expect(resultSetsEqual(base, undefined)).toBe(false);
    expect(resultSetsEqual(null, null)).toBe(true);
  });

  it("distinguishes NULL from 0 and from an empty string", () => {
    const nullRow = { columns: ["a"], values: [[null]] };
    expect(resultSetsEqual(nullRow, { columns: ["a"], values: [[0]] })).toBe(false);
    expect(resultSetsEqual(nullRow, { columns: ["a"], values: [[""]] })).toBe(false);
    expect(resultSetsEqual(nullRow, { columns: ["a"], values: [[null]] })).toBe(true);
  });

  it("does not conflate a number with its string form", () => {
    expect(resultSetsEqual({ columns: ["a"], values: [["1"]] }, base)).toBe(false);
  });
});

describe("gradeQuery against the day-0001 puzzle", () => {
  it("scores the reference solution as correct with a nonzero byte count", async () => {
    const result = await gradeQuery(dayOne.referenceSql, dayOne);
    expect(result.correct).toBe(true);
    expect(result.bytes).toBe(byteLength(dayOne.referenceSql));
  });

  it("rejects a query that only matches the preview data, not the hidden fixtures", async () => {
    // Hardcodes the preview's expected rows instead of actually querying —
    // this is exactly what the hidden fixtures exist to catch. UNION ALL
    // (not UNION) keeps row order stable so it passes the preview fixture.
    const hardcoded = "SELECT 'Grace' AS name, 900 AS total UNION ALL SELECT 'Ada', 700";
    const result = await gradeQuery(hardcoded, dayOne);
    expect(result.correct).toBe(false);
    expect(result.failedFixture).not.toBeNull();
    expect(result.failedFixture).not.toBe("preview");
  });

  it("rejects a query that omits the exclusion of orderless customers", async () => {
    const noFilter =
      "SELECT c.name, SUM(o.amount) AS total FROM customers c " +
      "LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id ORDER BY total DESC";
    const result = await gradeQuery(noFilter, dayOne);
    expect(result.correct).toBe(false);
  });

  it("treats an empty query as incorrect with zero bytes", async () => {
    const result = await gradeQuery("   ", dayOne);
    expect(result).toEqual({ correct: false, bytes: 0, failedFixture: null });
  });
});

describe("runAgainstFixture against a failing engine", () => {
  it("rejects instead of leaving an unresolved promise when the engine can't load", async () => {
    // createSeededDatabase is awaited before there's a db to run the query
    // against or to close — the failure has to surface as a rejection, not
    // vanish, so a caller (gradeQuery, then submit()) can react to it.
    createSeededDatabase.mockRejectedValueOnce(new Error("wasm fetch failed"));
    await expect(runAgainstFixture("SELECT 1", dayOne.fixtures[0])).rejects.toThrow(
      /wasm fetch failed/,
    );
  });

  it("still closes the database when the query itself throws", async () => {
    const close = vi.fn();
    createSeededDatabase.mockResolvedValueOnce({
      exec: () => {
        throw new Error('near "SELCT": syntax error');
      },
      close,
    });
    const passed = await runAgainstFixture("SELCT 1", dayOne.fixtures[0]);
    expect(passed).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
