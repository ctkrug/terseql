import { describe, expect, it } from "vitest";
import { createDatabase, createSeededDatabase } from "../src/db.js";

describe("createDatabase", () => {
  it("creates an empty database that can run a query", async () => {
    const db = await createDatabase();
    const [result] = db.exec("SELECT 1 + 1 AS answer");
    expect(result.values).toEqual([[2]]);
    db.close();
  });
});

describe("createSeededDatabase", () => {
  it("applies schema and seed data before returning", async () => {
    const db = await createSeededDatabase(
      "CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2), (3);",
    );
    const [result] = db.exec("SELECT SUM(n) AS total FROM t");
    expect(result.values).toEqual([[6]]);
    db.close();
  });
});
