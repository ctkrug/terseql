// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, executeQuery } from "../src/app.js";
import { byteLength } from "../src/grader.js";
import { dayOne } from "../src/puzzles/day-0001.js";

/**
 * The other app tests inject a fake engine to stay fast and deterministic.
 * These drive the real SQLite-in-WASM build end to end — the wow moment as a
 * player experiences it — so a break in the actual engine path can't hide
 * behind a passing mock.
 */

const NOW = new Date("2026-07-16T12:00:00Z");

function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({
    root,
    puzzle: dayOne,
    now: NOW,
    sfx: { play: () => false, isMuted: () => true, setMuted: () => {}, toggleMute: () => {} },
    leaderboard: {
      isEnabled: () => false,
      submit: () => Promise.resolve({ ok: false }),
      fetchTop: () => Promise.resolve({ ok: false, reason: "not-configured" }),
    },
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    // No execute/grade override: the real engine runs.
  });
  return { app, $: (sel) => root.querySelector(sel) };
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("executeQuery against the real engine", () => {
  it("runs a query and returns real rows", async () => {
    const outcome = await executeQuery(
      "SELECT name FROM customers ORDER BY name",
      dayOne.previewSetupSql,
    );
    expect(outcome).toEqual({
      ok: true,
      result: { columns: ["name"], values: [["Ada"], ["Alan"], ["Grace"]] },
    });
  });

  it("returns a real SQLite error message for bad SQL", async () => {
    const outcome = await executeQuery("SELCT 1", dayOne.previewSetupSql);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/syntax error/i);
  });

  it("names an unknown column the way SQLite does", async () => {
    const outcome = await executeQuery("SELECT nope FROM customers", dayOne.previewSetupSql);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/no such column/i);
  });

  it("reports an empty result rather than failing", async () => {
    const outcome = await executeQuery(
      "SELECT name FROM customers WHERE 0",
      dayOne.previewSetupSql,
    );
    expect(outcome).toEqual({ ok: true, result: { columns: [], values: [] } });
  });

  it("isolates each run, so a destructive query cannot poison the next", async () => {
    // The player is free to do this; the next Run must see a pristine database.
    const dropped = await executeQuery("DROP TABLE orders", dayOne.previewSetupSql);
    expect(dropped.ok).toBe(true);

    const after = await executeQuery("SELECT COUNT(*) FROM orders", dayOne.previewSetupSql);
    expect(after).toEqual({ ok: true, result: { columns: ["COUNT(*)"], values: [[3]] } });
  });

  it("does not leak inserted rows between runs", async () => {
    await executeQuery("INSERT INTO customers VALUES (99, 'Mallory')", dayOne.previewSetupSql);
    const after = await executeQuery("SELECT COUNT(*) FROM customers", dayOne.previewSetupSql);
    expect(after.result.values).toEqual([[3]]);
  });
});

describe("the solve loop, on the real engine", () => {
  it("renders the real result table for a query typed into the editor", async () => {
    const { app, $ } = mount();

    const sql = "SELECT name FROM customers ORDER BY name";
    $("#query").value = sql;
    $("#query").dispatchEvent(new Event("input"));
    await app.run();

    expect($("#results").dataset.state).toBe("result");
    expect([...$("#results").querySelectorAll("tbody td")].map((td) => td.textContent)).toEqual([
      "Ada",
      "Alan",
      "Grace",
    ]);
    expect($("#byte-count").textContent).toBe(String(byteLength(sql)));
  });

  it("grades the real reference solution as a win", async () => {
    const { app, $ } = mount();

    $("#query").value = dayOne.referenceSql.trim();
    $("#query").dispatchEvent(new Event("input"));
    await app.submit();

    expect($("#win").hidden).toBe(false);
    expect($(".win-delta").textContent).toBe("First solve");
  });

  it("rejects a query that hardcodes the visible sample's answer", async () => {
    // The whole premise: this matches the preview exactly and still loses.
    const { app, $ } = mount();

    $("#query").value = "SELECT 'Grace',900 UNION ALL SELECT 'Ada',700";
    await app.run();
    expect($("#results").dataset.state).toBe("result");

    await app.submit();
    expect($("#win").hidden).toBe(true);
    expect($("#results").textContent).toContain("fails a hidden case");
  });

  it("shows a real syntax error in the panel without throwing", async () => {
    const { app, $ } = mount();

    $("#query").value = "SELCT nope FROM";
    await expect(app.run()).resolves.toBeUndefined();
    expect($("#results").dataset.state).toBe("error");
    expect($("#results").textContent).toMatch(/syntax error/i);
  });

  it("records a shorter solve and reports the byte delta", async () => {
    const { app, $ } = mount();

    // Both are genuinely correct against every fixture; the second is the
    // first golfed down — which is the entire game.
    const long =
      "SELECT c.name, SUM(o.amount) AS total FROM customers c " +
      "JOIN orders o ON o.customer_id = c.id GROUP BY c.id ORDER BY total DESC";
    const short =
      "SELECT name,SUM(amount)t FROM customers c JOIN orders ON customer_id=c.id GROUP BY c.id ORDER BY t DESC";

    $("#query").value = long;
    await app.submit();
    expect($("#win").hidden).toBe(false);

    $("#query").value = short;
    await app.submit();

    const stored = JSON.parse(localStorage.getItem("terseql:results"))[dayOne.id];
    expect(stored.bytes).toBe(byteLength(short));
    expect(stored.trail).toEqual([byteLength(long), byteLength(short)]);
    expect($(".win-delta").textContent).toBe(
      `${byteLength(long) - byteLength(short)} bytes shorter`,
    );
  });
});
