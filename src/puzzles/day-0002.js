const SCHEMA = `
  CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
  CREATE TABLE loans (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL,
    days_out INTEGER NOT NULL
  );
`;

/** @type {import("./schema.js").Puzzle} */
export const dayTwo = {
  id: "2026-07-17",
  title: "Long Loans",
  prompt:
    "Return the title of every book that has been loaned out for more than 14 days at " +
    "least once, alphabetically, with each title appearing only once.",
  schemaSql: SCHEMA,
  previewSetupSql: `
    ${SCHEMA}
    INSERT INTO books VALUES (1, 'Dune'), (2, 'Neuromancer'), (3, 'Ubik');
    INSERT INTO loans VALUES (1, 1, 20), (2, 1, 3), (3, 2, 14), (4, 3, 15);
  `,
  referenceSql: `
    SELECT DISTINCT title
    FROM books JOIN loans ON loans.book_id = books.id
    WHERE days_out > 14
    ORDER BY title;
  `,
  fixtures: [
    {
      name: "preview",
      setupSql: `
        ${SCHEMA}
        INSERT INTO books VALUES (1, 'Dune'), (2, 'Neuromancer'), (3, 'Ubik');
        INSERT INTO loans VALUES (1, 1, 20), (2, 1, 3), (3, 2, 14), (4, 3, 15);
      `,
      expected: {
        columns: ["title"],
        values: [["Dune"], ["Ubik"]],
      },
    },
    {
      // 14 days is not "more than 14" — an off-by-one here means >= instead of >.
      name: "hidden-boundary-exactly-14",
      setupSql: `
        ${SCHEMA}
        INSERT INTO books VALUES (1, 'Solaris'), (2, 'Roadside Picnic');
        INSERT INTO loans VALUES (1, 1, 14), (2, 2, 14), (3, 2, 1);
      `,
      expected: { columns: [], values: [] },
    },
    {
      // Two long loans of the same book must not duplicate the title.
      name: "hidden-duplicate-long-loans",
      setupSql: `
        ${SCHEMA}
        INSERT INTO books VALUES (1, 'Solaris'), (2, 'Blindsight');
        INSERT INTO loans VALUES (1, 1, 30), (2, 1, 21), (3, 1, 90), (4, 2, 16);
      `,
      expected: {
        columns: ["title"],
        values: [["Blindsight"], ["Solaris"]],
      },
    },
    {
      // A book with no loans at all must not appear.
      name: "hidden-book-without-loans",
      setupSql: `
        ${SCHEMA}
        INSERT INTO books VALUES (1, 'Anathem'), (2, 'Never Lent');
        INSERT INTO loans VALUES (1, 1, 40);
      `,
      expected: {
        columns: ["title"],
        values: [["Anathem"]],
      },
    },
  ],
};
