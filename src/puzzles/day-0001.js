/** @type {import("./schema.js").Puzzle} */
export const dayOne = {
  id: "2026-07-16",
  title: "Top Spenders",
  prompt:
    "Return each customer's name and total spend, highest spend first. " +
    "Only include customers who have placed at least one order.",
  schemaSql: `
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      amount INTEGER NOT NULL
    );
  `,
  previewSetupSql: `
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      amount INTEGER NOT NULL
    );
    INSERT INTO customers VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Alan');
    INSERT INTO orders VALUES (1, 1, 500), (2, 1, 200), (3, 2, 900);
  `,
  referenceSql: `
    SELECT c.name, SUM(o.amount) AS total
    FROM customers c JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
    ORDER BY total DESC;
  `,
  fixtures: [
    {
      name: "preview",
      setupSql: `
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          amount INTEGER NOT NULL
        );
        INSERT INTO customers VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Alan');
        INSERT INTO orders VALUES (1, 1, 500), (2, 1, 200), (3, 2, 900);
      `,
      expected: {
        columns: ["name", "total"],
        values: [
          ["Grace", 900],
          ["Ada", 700],
        ],
      },
    },
    {
      name: "hidden-excludes-orderless-customer",
      setupSql: `
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          amount INTEGER NOT NULL
        );
        INSERT INTO customers VALUES (1, 'Ada'), (2, 'Bea');
        INSERT INTO orders VALUES (1, 1, 50);
      `,
      expected: {
        columns: ["name", "total"],
        values: [["Ada", 50]],
      },
    },
    {
      name: "hidden-refund-reduces-total",
      setupSql: `
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          amount INTEGER NOT NULL
        );
        INSERT INTO customers VALUES (1, 'Ada'), (2, 'Bea'), (3, 'Cy');
        INSERT INTO orders VALUES
          (1, 1, 10), (2, 1, 5),
          (3, 2, 7),
          (4, 3, 100), (5, 3, -20);
      `,
      expected: {
        columns: ["name", "total"],
        values: [
          ["Cy", 80],
          ["Ada", 15],
          ["Bea", 7],
        ],
      },
    },
  ],
};
