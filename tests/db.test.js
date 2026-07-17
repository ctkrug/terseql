import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("closes the database if the setup SQL throws, instead of leaking it", async () => {
    // A fixture with broken setupSql (a puzzle-authoring mistake) must not
    // leak the WASM-backed database it already allocated before failing.
    const probe = await createDatabase();
    const DatabaseClass = probe.constructor;
    probe.close();

    const closeSpy = vi.spyOn(DatabaseClass.prototype, "close");
    await expect(createSeededDatabase("NOT VALID SQL AT ALL (((")).rejects.toThrow();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    closeSpy.mockRestore();
  });
});

describe("engine load failure recovery", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("sql.js");
  });

  it("does not brick the session after one rejected engine load", async () => {
    // A mobile blip or CDN hiccup on the ~660KB WASM fetch must not poison
    // every later createDatabase() call for the rest of the page's life —
    // only a reload should not be required to recover.
    vi.resetModules();
    const real = await import("sql.js");
    let calls = 0;
    vi.doMock("sql.js", () => ({
      default: (config) => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("wasm fetch failed")) : real.default(config);
      },
    }));

    const fresh = await import("../src/db.js");
    await expect(fresh.createDatabase()).rejects.toThrow("wasm fetch failed");

    const db = await fresh.createDatabase();
    const [result] = db.exec("SELECT 1 + 1 AS answer");
    expect(result.values).toEqual([[2]]);
    db.close();
    expect(calls).toBe(2);
  });
});
