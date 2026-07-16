import { describe, expect, it } from "vitest";
import { byteLength, gradeQuery, resultSetsEqual } from "../src/grader.js";
import { dayOne } from "../src/puzzles/day-0001.js";

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
