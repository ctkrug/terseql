const SCHEMA = `
  CREATE TABLE txns (
    id INTEGER PRIMARY KEY,
    day INTEGER NOT NULL UNIQUE,
    amount INTEGER NOT NULL
  );
`;

const PREVIEW_SETUP_SQL = `
  ${SCHEMA}
  INSERT INTO txns VALUES (1, 1, 100), (2, 2, 50), (3, 3, -30), (4, 4, 200);
`;

/** @type {import("./schema.js").Puzzle} */
export const dayFive = {
  id: "2026-07-20",
  title: "Running Balance",
  prompt:
    "Return each transaction's day, amount, and the running balance — the sum of every " +
    "amount up to and including that day — ordered by day. Days are unique.",
  schemaSql: SCHEMA,
  previewSetupSql: PREVIEW_SETUP_SQL,
  referenceSql: `
    SELECT day, amount, SUM(amount) OVER (ORDER BY day) AS balance
    FROM txns
    ORDER BY day;
  `,
  fixtures: [
    {
      name: "preview",
      // Deliberately the *same value* as previewSetupSql, not a retyped
      // copy — app.js and the grader both rely on this fixture matching
      // the preview exactly, and a copy can silently drift.
      setupSql: PREVIEW_SETUP_SQL,
      expected: {
        columns: ["day", "amount", "balance"],
        values: [
          [1, 100, 100],
          [2, 50, 150],
          [3, -30, 120],
          [4, 200, 320],
        ],
      },
    },
    {
      // Rows are inserted out of day order — the running sum must follow day,
      // not rowid, so a query relying on insertion order breaks here.
      name: "hidden-rows-inserted-out-of-order",
      setupSql: `
        ${SCHEMA}
        INSERT INTO txns VALUES (1, 9, 5), (2, 2, 10), (3, 5, 1);
      `,
      expected: {
        columns: ["day", "amount", "balance"],
        values: [
          [2, 10, 10],
          [5, 1, 11],
          [9, 5, 16],
        ],
      },
    },
    {
      // The balance goes negative and recovers.
      name: "hidden-balance-dips-negative",
      setupSql: `
        ${SCHEMA}
        INSERT INTO txns VALUES (1, 1, 10), (2, 2, -40), (3, 3, 35);
      `,
      expected: {
        columns: ["day", "amount", "balance"],
        values: [
          [1, 10, 10],
          [2, -40, -30],
          [3, 35, 5],
        ],
      },
    },
    {
      name: "hidden-single-transaction",
      setupSql: `
        ${SCHEMA}
        INSERT INTO txns VALUES (1, 7, 42);
      `,
      expected: {
        columns: ["day", "amount", "balance"],
        values: [[7, 42, 42]],
      },
    },
    {
      name: "hidden-empty-ledger",
      setupSql: SCHEMA,
      expected: { columns: [], values: [] },
    },
  ],
};
