const SCHEMA = `
  CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
  CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    post_id INTEGER NOT NULL,
    tag TEXT NOT NULL
  );
`;

/** @type {import("./schema.js").Puzzle} */
export const dayFour = {
  id: "2026-07-19",
  title: "Popular Tags",
  prompt:
    "Return each tag used on two or more distinct posts, alongside the number of posts " +
    "using it. Most posts first; break ties by tag, A to Z.",
  schemaSql: SCHEMA,
  previewSetupSql: `
    ${SCHEMA}
    INSERT INTO posts VALUES (1, 'Indexes'), (2, 'Joins'), (3, 'Windows');
    INSERT INTO tags VALUES
      (1, 1, 'sql'), (2, 1, 'perf'),
      (3, 2, 'sql'), (4, 2, 'basics'),
      (5, 3, 'sql'), (6, 3, 'perf');
  `,
  referenceSql: `
    SELECT tag, COUNT(DISTINCT post_id) AS posts
    FROM tags
    GROUP BY tag
    HAVING posts >= 2
    ORDER BY posts DESC, tag;
  `,
  fixtures: [
    {
      name: "preview",
      setupSql: `
        ${SCHEMA}
        INSERT INTO posts VALUES (1, 'Indexes'), (2, 'Joins'), (3, 'Windows');
        INSERT INTO tags VALUES
          (1, 1, 'sql'), (2, 1, 'perf'),
          (3, 2, 'sql'), (4, 2, 'basics'),
          (5, 3, 'sql'), (6, 3, 'perf');
      `,
      expected: {
        columns: ["tag", "posts"],
        values: [
          ["sql", 3],
          ["perf", 2],
        ],
      },
    },
    {
      // The trap: 'sql' is on post 1 twice. COUNT(*) says 2 and wrongly
      // includes it; the answer counts DISTINCT posts, so it stays out.
      name: "hidden-same-tag-twice-on-one-post",
      setupSql: `
        ${SCHEMA}
        INSERT INTO posts VALUES (1, 'Indexes'), (2, 'Joins');
        INSERT INTO tags VALUES
          (1, 1, 'sql'), (2, 1, 'sql'),
          (3, 1, 'perf'), (4, 2, 'perf');
      `,
      expected: {
        columns: ["tag", "posts"],
        values: [["perf", 2]],
      },
    },
    {
      // Nothing qualifies — every tag is used once.
      name: "hidden-all-singletons",
      setupSql: `
        ${SCHEMA}
        INSERT INTO posts VALUES (1, 'Indexes'), (2, 'Joins');
        INSERT INTO tags VALUES (1, 1, 'sql'), (2, 2, 'perf');
      `,
      expected: { columns: [], values: [] },
    },
    {
      // Equal counts must be ordered by tag, not by group discovery order.
      name: "hidden-ties-broken-by-tag",
      setupSql: `
        ${SCHEMA}
        INSERT INTO posts VALUES (1, 'A'), (2, 'B');
        INSERT INTO tags VALUES
          (1, 1, 'zebra'), (2, 2, 'zebra'),
          (3, 1, 'alpha'), (4, 2, 'alpha'),
          (5, 1, 'mid'), (6, 2, 'mid');
      `,
      expected: {
        columns: ["tag", "posts"],
        values: [
          ["alpha", 2],
          ["mid", 2],
          ["zebra", 2],
        ],
      },
    },
  ],
};
