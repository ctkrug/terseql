const SCHEMA = `
  CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    amount INTEGER NOT NULL
  );
`;

/** @type {import("./schema.js").Puzzle} */
export const dayThree = {
  id: "2026-07-18",
  title: "Zero, Not Nothing",
  prompt:
    "Return every employee's name and their total sales — 0, not NULL, for anyone who " +
    "hasn't sold anything. Highest total first; break ties by name, A to Z.",
  schemaSql: SCHEMA,
  previewSetupSql: `
    ${SCHEMA}
    INSERT INTO employees VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Alan');
    INSERT INTO sales VALUES (1, 1, 300), (2, 1, 150), (3, 2, 500);
  `,
  referenceSql: `
    SELECT e.name, COALESCE(SUM(s.amount), 0) AS total
    FROM employees e LEFT JOIN sales s ON s.employee_id = e.id
    GROUP BY e.id
    ORDER BY total DESC, e.name;
  `,
  fixtures: [
    {
      name: "preview",
      setupSql: `
        ${SCHEMA}
        INSERT INTO employees VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Alan');
        INSERT INTO sales VALUES (1, 1, 300), (2, 1, 150), (3, 2, 500);
      `,
      expected: {
        columns: ["name", "total"],
        values: [
          ["Grace", 500],
          ["Ada", 450],
          ["Alan", 0],
        ],
      },
    },
    {
      // An inner join drops Bea entirely; SUM without COALESCE gives her NULL.
      name: "hidden-everyone-sold-nothing",
      setupSql: `
        ${SCHEMA}
        INSERT INTO employees VALUES (1, 'Bea'), (2, 'Cy');
      `,
      expected: {
        columns: ["name", "total"],
        values: [
          ["Bea", 0],
          ["Cy", 0],
        ],
      },
    },
    {
      // Equal totals must be ordered by name, not by insertion or id.
      name: "hidden-ties-broken-by-name",
      setupSql: `
        ${SCHEMA}
        INSERT INTO employees VALUES (1, 'Zoe'), (2, 'Abe'), (3, 'Mel');
        INSERT INTO sales VALUES (1, 1, 100), (2, 2, 100), (3, 3, 100);
      `,
      expected: {
        columns: ["name", "total"],
        values: [
          ["Abe", 100],
          ["Mel", 100],
          ["Zoe", 100],
        ],
      },
    },
    {
      // A refund can push a real seller below an employee who sold nothing.
      name: "hidden-negative-total-sorts-below-zero",
      setupSql: `
        ${SCHEMA}
        INSERT INTO employees VALUES (1, 'Ada'), (2, 'Bea');
        INSERT INTO sales VALUES (1, 1, 50), (2, 1, -80);
      `,
      expected: {
        columns: ["name", "total"],
        values: [
          ["Bea", 0],
          ["Ada", -30],
        ],
      },
    },
  ],
};
