// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResultPanel, formatCell } from "../src/ui/result-table.js";

let root;
let panel;
beforeEach(() => {
  document.body.innerHTML = '<div id="results"></div>';
  root = document.getElementById("results");
  panel = createResultPanel(root);
});

const headers = () => [...root.querySelectorAll("th")].map((th) => th.textContent);
const rows = () =>
  [...root.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent),
  );

describe("formatCell", () => {
  it("renders NULL as a distinguishable literal, not a blank cell", () => {
    expect(formatCell(null)).toEqual({ text: "NULL", className: "cell-null" });
    expect(formatCell(undefined).text).toBe("NULL");
  });

  it("keeps NULL, empty string, and zero visually distinct", () => {
    // In a golf puzzle the difference between these is often the whole point.
    expect(formatCell(null).text).toBe("NULL");
    expect(formatCell("").text).toBe("");
    expect(formatCell(0).text).toBe("0");
    expect(formatCell(null).className).not.toBe(formatCell("").className);
  });

  it("tags numbers and text differently so they can align differently", () => {
    expect(formatCell(42).className).toBe("cell-number");
    expect(formatCell("42").className).toBe("cell-text");
  });

  it("summarizes a blob rather than dumping bytes", () => {
    expect(formatCell(new Uint8Array([1, 2, 3]))).toEqual({
      text: "blob(3)",
      className: "cell-blob",
    });
  });

  it("renders negative and fractional numbers", () => {
    expect(formatCell(-30).text).toBe("-30");
    expect(formatCell(1.5).text).toBe("1.5");
  });
});

describe("createResultPanel", () => {
  it("requires a root element", () => {
    expect(() => createResultPanel(null)).toThrow(/root element/);
  });

  it("renders columns and rows", () => {
    panel.showResult({
      columns: ["name", "total"],
      values: [
        ["Grace", 900],
        ["Ada", 700],
      ],
    });

    expect(headers()).toEqual(["name", "total"]);
    expect(rows()).toEqual([
      ["Grace", "900"],
      ["Ada", "700"],
    ]);
    expect(panel.getState()).toBe("result");
  });

  it("preserves row order exactly as SQLite returned it", () => {
    panel.showResult({ columns: ["n"], values: [[3], [1], [2]] });
    expect(rows()).toEqual([["3"], ["1"], ["2"]]);
  });

  it("reports the row count, pluralized", () => {
    panel.showResult({ columns: ["n"], values: [[1]] });
    expect(root.querySelector(".result-meta").textContent).toBe("1 row");

    panel.showResult({ columns: ["n"], values: [[1], [2]] });
    expect(root.querySelector(".result-meta").textContent).toBe("2 rows");
  });

  it("caps rendered rows and says so rather than freezing on a huge result", () => {
    const values = Array.from({ length: 5000 }, (_, i) => [i]);
    panel.showResult({ columns: ["n"], values });

    expect(rows()).toHaveLength(200);
    expect(root.querySelector(".result-meta").textContent).toBe("200 of 5000 rows shown");
  });

  const liveRegion = () => root.querySelector('[aria-live="polite"]');

  it("announces a short summary, never the table itself", () => {
    // A live region that contains the table queues the whole thing for a
    // screen reader on every Run — unusable past a handful of rows.
    const values = Array.from({ length: 5000 }, (_, i) => [i]);
    panel.showResult({ columns: ["n"], values });

    expect(liveRegion().textContent).toBe("200 of 5000 rows shown");
    expect(liveRegion().textContent).not.toContain("<table");
    expect(liveRegion().querySelector("table")).toBeNull();
  });

  it("announces state changes for idle, running, empty and error too", () => {
    panel.showRunning();
    expect(liveRegion().textContent).toBe("Running…");

    panel.showEmpty();
    expect(liveRegion().textContent).toBe("0 rows");

    panel.showError('near "SELCT": syntax error');
    expect(liveRegion().textContent).toContain("SELCT");

    panel.showIdle();
    expect(liveRegion().textContent).toBe("");
  });

  it("renders text as text — a query can return markup and must not run it", () => {
    // Reachable with `SELECT '<img src=x onerror=alert(1)>'`.
    const payload = '<img src=x onerror="alert(1)">';
    panel.showResult({ columns: ["evil"], values: [[payload]] });

    expect(root.querySelector("img")).toBeNull();
    expect(rows()).toEqual([[payload]]);
  });

  it("renders a column name as text too", () => {
    panel.showResult({ columns: ["<script>x</script>"], values: [[1]] });
    expect(root.querySelector("script")).toBeNull();
    expect(headers()).toEqual(["<script>x</script>"]);
  });

  it("shows the empty state for a query that matched nothing", () => {
    panel.showResult({ columns: [], values: [] });
    expect(panel.getState()).toBe("empty");
    expect(root.textContent).toContain("0 rows");
  });

  it("shows the empty state for a missing result rather than blanking", () => {
    panel.showResult(undefined);
    expect(panel.getState()).toBe("empty");
  });

  it("still falls back to the empty state when showResult is destructured off the panel", () => {
    // showResult delegates to this.showEmpty(), which breaks the moment the
    // panel object is pulled apart — and app.js is built to accept an
    // injected panel, the exact shape a caller might destructure.
    const { showResult } = panel;
    expect(() => showResult(undefined)).not.toThrow();
    expect(panel.getState()).toBe("empty");
  });

  it("distinguishes 'no rows' from an error", () => {
    panel.showEmpty();
    expect(panel.getState()).toBe("empty");
    panel.showError("no such column: nam");
    expect(panel.getState()).toBe("error");
  });

  it("shows a SQLite error as designed copy, not a stack trace", () => {
    panel.showError('near "SELCT": syntax error');
    expect(root.textContent).toContain('near "SELCT": syntax error');
    expect(root.querySelector(".panel-state-error")).not.toBeNull();
  });

  it("survives an error with no message", () => {
    panel.showError(undefined);
    expect(panel.getState()).toBe("error");
    expect(root.textContent).toContain("Unknown error");
  });

  it("renders an error message as text, not markup", () => {
    panel.showError("<b>boom</b>");
    expect(root.querySelector("b")).toBeNull();
  });

  it("has a designed idle state before the first run", () => {
    panel.showIdle();
    expect(panel.getState()).toBe("idle");
    expect(root.textContent).toContain("Nothing run yet");
  });

  it("has a running state", () => {
    panel.showRunning();
    expect(panel.getState()).toBe("running");
  });

  it("replaces previous content instead of appending to it", () => {
    panel.showResult({ columns: ["n"], values: [[1]] });
    panel.showError("boom");
    expect(root.querySelectorAll("table")).toHaveLength(0);

    panel.showResult({ columns: ["n"], values: [[1]] });
    expect(root.querySelectorAll("table")).toHaveLength(1);
  });

  it("flashes pass and fail exclusively", () => {
    panel.flash("fail");
    expect(root.classList.contains("flash-fail")).toBe(true);

    panel.flash("pass");
    expect(root.classList.contains("flash-pass")).toBe(true);
    expect(root.classList.contains("flash-fail")).toBe(false);
  });
});

describe("destroy", () => {
  it("cancels the pending flash timer", () => {
    // flash() leaves a 600ms setTimeout behind; its sibling components
    // (byte-counter, win-overlay) both expose a destroy() app.js calls on
    // teardown, but this one had none to cancel its own timer.
    vi.useFakeTimers();
    panel.flash("pass");
    expect(vi.getTimerCount()).toBe(1);

    panel.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
