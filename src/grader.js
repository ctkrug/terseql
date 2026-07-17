import { createSeededDatabase } from "./db.js";

/**
 * Score is UTF-8 byte length, not character count, so multi-byte
 * identifiers/strings can't be used to game the leaderboard.
 */
export function byteLength(query) {
  return new TextEncoder().encode(query).length;
}

function valuesEqual(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || Math.abs(a - b) < 1e-9;
  }
  return a === b;
}

/**
 * Compare two sql.js result sets ({columns, values}).
 *
 * Row order and column order both matter: SQL guarantees neither without an
 * ORDER BY, so a puzzle that cares must say so in its prompt, and the grader
 * never silently reorders on the player's behalf.
 *
 * Column *names* deliberately do NOT matter — only how many there are. This
 * is a golf game scored in bytes, and charging a player for `AS total` would
 * tax them for a label nobody reads. `SELECT name, SUM(amount) ...` scores
 * the same as the aliased version.
 */
export function resultSetsEqual(actual, expected) {
  if (!actual || !expected) return actual === expected;
  if (actual.columns.length !== expected.columns.length) return false;
  if (actual.values.length !== expected.values.length) return false;
  for (let row = 0; row < expected.values.length; row++) {
    const a = actual.values[row];
    const e = expected.values[row];
    if (a.length !== e.length) return false;
    for (let col = 0; col < e.length; col++) {
      if (!valuesEqual(a[col], e[col])) return false;
    }
  }
  return true;
}

/**
 * Run a candidate query against one hidden fixture (its own isolated
 * database, seeded fresh) and report whether it matches the expected
 * result exactly.
 */
export async function runAgainstFixture(query, fixture) {
  let db;
  try {
    db = await createSeededDatabase(fixture.setupSql);
  } catch (err) {
    // The engine failed to load, not the player's query — a distinct error
    // so callers can tell "your SQL is wrong" apart from "the grader is
    // broken" instead of the two collapsing into one silent rejection.
    throw new Error(`Could not prepare the "${fixture.name}" fixture: ${err?.message ?? err}`, {
      cause: err,
    });
  }
  try {
    const result = db.exec(query);
    const actual = result[0] ?? { columns: [], values: [] };
    return resultSetsEqual(actual, fixture.expected);
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/**
 * Grade a query against every fixture in a puzzle. A query only counts as
 * correct if it passes ALL fixtures — including the hidden ones not shown
 * in the puzzle preview — so matching the visible sample data alone isn't
 * enough to score.
 */
export async function gradeQuery(query, puzzle) {
  if (!query || !query.trim()) {
    return { correct: false, bytes: 0, failedFixture: null };
  }
  for (const fixture of puzzle.fixtures) {
    const passed = await runAgainstFixture(query, fixture);
    if (!passed) {
      return { correct: false, bytes: byteLength(query), failedFixture: fixture.name };
    }
  }
  return { correct: true, bytes: byteLength(query), failedFixture: null };
}
