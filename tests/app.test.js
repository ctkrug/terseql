// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { dayOne } from "../src/puzzles/day-0001.js";

const NOW = new Date("2026-07-16T12:00:00Z");

function silentSfx() {
  return {
    play: vi.fn(() => true),
    isMuted: vi.fn(() => false),
    setMuted: vi.fn(),
    toggleMute: vi.fn(),
    isReady: () => false,
  };
}

function offlineBoard() {
  return {
    isEnabled: () => false,
    submit: vi.fn(() => Promise.resolve({ ok: false, reason: "not-configured" })),
    fetchTop: vi.fn(() => Promise.resolve({ ok: false, reason: "not-configured" })),
  };
}

function mount(overrides = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({
    root,
    puzzle: dayOne,
    now: NOW,
    sfx: silentSfx(),
    leaderboard: offlineBoard(),
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    execute: vi.fn(() => Promise.resolve({ ok: true, result: { columns: ["a"], values: [[1]] } })),
    grade: vi.fn(() => Promise.resolve({ correct: false, bytes: 10, failedFixture: "preview" })),
    ...overrides,
  });
  return { root, app, $: (sel) => root.querySelector(sel) };
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("createApp", () => {
  it("requires a root and a puzzle", () => {
    expect(() => createApp({ puzzle: dayOne })).toThrow(/root element/);
    expect(() => createApp({ root: document.createElement("div") })).toThrow(/puzzle/);
  });

  it("renders the puzzle brief", () => {
    const { root } = mount();
    expect(root.querySelector("#brief-title").textContent).toBe(dayOne.title);
    expect(root.querySelector("#brief-prompt").textContent).toBe(dayOne.prompt);
    expect(root.querySelector("#brief-schema").textContent).toContain("CREATE TABLE customers");
  });

  it("shows the puzzle's own date, not the viewer's local one", () => {
    const { $ } = mount();
    expect($(".topbar-date").textContent).toContain("July 16");
  });

  it("starts with a designed idle result panel, not a blank area", () => {
    const { $ } = mount();
    expect($("#results").dataset.state).toBe("idle");
    expect($("#results").textContent).toContain("Nothing run yet");
  });

  it("marks the results panel as a live region", () => {
    const { $ } = mount();
    expect($("#results").getAttribute("aria-live")).toBe("polite");
  });
});

describe("byte counter", () => {
  it("starts at zero", () => {
    const { $ } = mount();
    expect($("#byte-count").textContent).toBe("0");
  });

  it("updates on every keystroke", () => {
    const { $ } = mount();
    const editor = $("#query");

    editor.value = "SELECT 1";
    editor.dispatchEvent(new Event("input"));
    expect($("#byte-count").textContent).toBe("8");

    editor.value = "SELECT 1;";
    editor.dispatchEvent(new Event("input"));
    expect($("#byte-count").textContent).toBe("9");
  });

  it("counts UTF-8 bytes, not characters", () => {
    const { $ } = mount();
    const editor = $("#query");
    editor.value = "SELECT 'é'";
    editor.dispatchEvent(new Event("input"));

    // 10 characters, 11 bytes — the counter must score the bytes.
    expect(editor.value).toHaveLength(10);
    expect($("#byte-count").textContent).toBe("11");
  });

  it("ticks the keystroke sound as the count changes", () => {
    const sfx = silentSfx();
    const { $ } = mount({ sfx });
    const editor = $("#query");

    editor.value = "SELECT 1";
    editor.dispatchEvent(new Event("input"));
    expect(sfx.play).toHaveBeenCalledWith("keystroke");
  });
});

describe("run", () => {
  it("executes the query against the preview database and renders the table", async () => {
    const execute = vi.fn(() =>
      Promise.resolve({ ok: true, result: { columns: ["name"], values: [["Ada"]] } }),
    );
    const { $, app } = mount({ execute });

    $("#query").value = "SELECT name FROM customers";
    await app.run();

    expect(execute).toHaveBeenCalledWith("SELECT name FROM customers", dayOne.previewSetupSql);
    expect($("#results").dataset.state).toBe("result");
    expect($("#results").textContent).toContain("Ada");
  });

  it("runs on the Run button", async () => {
    const execute = vi.fn(() => Promise.resolve({ ok: true, result: { columns: [], values: [] } }));
    const { $ } = mount({ execute });

    $("#query").value = "SELECT 1";
    $("#run").click();
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
  });

  it("runs on Ctrl+Enter from the editor", async () => {
    const execute = vi.fn(() => Promise.resolve({ ok: true, result: { columns: [], values: [] } }));
    const { $ } = mount({ execute });

    $("#query").value = "SELECT 1";
    $("#query").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
  });

  it("shows a syntax error inline instead of throwing", async () => {
    const execute = vi.fn(() =>
      Promise.resolve({ ok: false, error: 'near "SELCT": syntax error' }),
    );
    const { $, app } = mount({ execute });

    $("#query").value = "SELCT 1";
    await expect(app.run()).resolves.toBeUndefined();

    expect($("#results").dataset.state).toBe("error");
    expect($("#results").textContent).toContain("syntax error");
  });

  it("plays the fail sound on a broken query", async () => {
    const sfx = silentSfx();
    const { $, app } = mount({ sfx, execute: () => Promise.resolve({ ok: false, error: "boom" }) });

    $("#query").value = "SELCT 1";
    await app.run();
    expect(sfx.play).toHaveBeenCalledWith("fail");
  });

  it("does nothing but reset to idle on an empty query", async () => {
    const execute = vi.fn();
    const { $, app } = mount({ execute });

    $("#query").value = "   ";
    await app.run();

    expect(execute).not.toHaveBeenCalled();
    expect($("#results").dataset.state).toBe("idle");
  });
});

describe("submit", () => {
  const passing = { correct: true, bytes: 61, failedFixture: null };

  it("grades against every fixture, not just the preview", async () => {
    const grade = vi.fn(() => Promise.resolve(passing));
    const { $, app } = mount({ grade });

    $("#query").value = "SELECT 1";
    await app.submit();

    expect(grade).toHaveBeenCalledWith("SELECT 1", dayOne);
  });

  it("celebrates a first solve", async () => {
    const { $, app } = mount({ grade: () => Promise.resolve(passing) });

    $("#query").value = "SELECT 1";
    await app.submit();

    expect($("#win").hidden).toBe(false);
    expect($(".win-bytes").textContent).toBe("61");
    expect($(".win-delta").textContent).toBe("First solve");
  });

  it("plays the win sound the first time and the pass sound after", async () => {
    const sfx = silentSfx();
    const { $, app } = mount({ sfx, grade: () => Promise.resolve(passing) });

    $("#query").value = "SELECT 1";
    await app.submit();
    expect(sfx.play).toHaveBeenCalledWith("win");

    sfx.play.mockClear();
    await app.submit();
    expect(sfx.play).toHaveBeenCalledWith("pass");
  });

  it("reports the byte delta when you golf it shorter", async () => {
    const grade = vi
      .fn()
      .mockResolvedValueOnce({ correct: true, bytes: 74, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 61, failedFixture: null });
    const { $, app } = mount({ grade });

    $("#query").value = "SELECT 1";
    await app.submit();
    await app.submit();

    expect($(".win-delta").textContent).toBe("13 bytes shorter");
  });

  it("persists the solve so a reload keeps your best", async () => {
    const { $, app } = mount({ grade: () => Promise.resolve(passing) });
    $("#query").value = "SELECT 1";
    await app.submit();

    const stored = JSON.parse(localStorage.getItem("terseql:results"));
    expect(stored[dayOne.id].bytes).toBe(61);
  });

  it("tells you a hidden fixture failed without revealing its data", async () => {
    const grade = () =>
      Promise.resolve({ correct: false, bytes: 30, failedFixture: "hidden-refund-reduces-total" });
    const { $, app } = mount({ grade });

    $("#query").value = "SELECT 1";
    await app.submit();

    expect($("#results").textContent).toContain("fails a hidden case");
    // The fixture's identity is the puzzle's hidden half — never leak it.
    expect($("#results").textContent).not.toContain("refund");
    expect($("#win").hidden).toBe(true);
  });

  it("distinguishes failing the visible sample from failing a hidden case", async () => {
    const grade = () => Promise.resolve({ correct: false, bytes: 30, failedFixture: "preview" });
    const { $, app } = mount({ grade });

    $("#query").value = "SELECT 1";
    await app.submit();
    expect($("#results").textContent).toContain("sample data you can see");
  });

  it("re-enables the submit button even when grading throws", async () => {
    const { $, app } = mount({ grade: () => Promise.reject(new Error("engine died")) });

    $("#query").value = "SELECT 1";
    await expect(app.submit()).rejects.toThrow("engine died");
    expect($("#submit").disabled).toBe(false);
    expect($("#submit").textContent).toBe("Submit");
  });

  it("submits on Ctrl+Shift+Enter", async () => {
    const grade = vi.fn(() => Promise.resolve(passing));
    const { $ } = mount({ grade });

    $("#query").value = "SELECT 1";
    $("#query").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, shiftKey: true }),
    );
    await vi.waitFor(() => expect(grade).toHaveBeenCalled());
  });

  it("posts the byte count to the shared board, without the query", async () => {
    const leaderboard = {
      isEnabled: () => true,
      submit: vi.fn(() => Promise.resolve({ ok: true })),
      fetchTop: vi.fn(() => Promise.resolve({ ok: true, entries: [] })),
    };
    const { $, app } = mount({ leaderboard, grade: () => Promise.resolve(passing) });

    $("#query").value = "SELECT 1";
    await app.submit();
    await vi.waitFor(() => expect(leaderboard.submit).toHaveBeenCalled());

    expect(leaderboard.submit).toHaveBeenCalledWith({
      puzzleId: dayOne.id,
      bytes: 61,
      timestamp: NOW.toISOString(),
    });
  });

  it("keeps the solve when the board submission fails", async () => {
    const leaderboard = {
      isEnabled: () => true,
      submit: vi.fn(() => Promise.reject(new Error("network down"))),
      fetchTop: vi.fn(() => Promise.resolve({ ok: false, reason: "network" })),
    };
    const { $, app } = mount({ leaderboard, grade: () => Promise.resolve(passing) });

    $("#query").value = "SELECT 1";
    await app.submit();

    expect($("#win").hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem("terseql:results"))[dayOne.id].bytes).toBe(61);
  });
});

describe("leaderboard", () => {
  it("shows solo mode when no backend is configured", async () => {
    const { $, app } = mount();
    await app.refreshBoard();

    expect($("#board").dataset.state).toBe("unavailable");
    expect($("#board").textContent).toContain("Solo mode");
  });

  it("renders the day's scores when the board answers", async () => {
    const leaderboard = {
      isEnabled: () => true,
      submit: vi.fn(),
      fetchTop: vi.fn(() => Promise.resolve({ ok: true, entries: [{ bytes: 49, name: "grace" }] })),
    };
    const { $, app } = mount({ leaderboard });
    await app.refreshBoard();

    expect($("#board").dataset.state).toBe("entries");
    expect($("#board").textContent).toContain("49");
  });

  it("degrades to a designed state when the board is unreachable", async () => {
    const leaderboard = {
      isEnabled: () => true,
      submit: vi.fn(),
      fetchTop: vi.fn(() => Promise.resolve({ ok: false, reason: "network" })),
    };
    const { $, app } = mount({ leaderboard });
    await app.refreshBoard();

    expect($("#board").textContent).toContain("Offline");
  });
});

describe("streak", () => {
  it("stays hidden for a player with no streak", () => {
    const { $ } = mount();
    expect($("#streak").hidden).toBe(true);
  });

  it("surfaces a streak of two or more days", () => {
    localStorage.setItem(
      "terseql:results",
      JSON.stringify({
        "2026-07-15": { bytes: 40, solvedAt: "x", trail: [40] },
        "2026-07-16": { bytes: 38, solvedAt: "x", trail: [38] },
      }),
    );
    const { $ } = mount();

    expect($("#streak").hidden).toBe(false);
    expect($("#streak").textContent).toContain("2-day streak");
  });
});

describe("mute toggle", () => {
  it("is an accessible toggle button", () => {
    const { $ } = mount();
    const button = $("#mute");
    expect(button.getAttribute("aria-label")).toBe("Mute sound");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles sound and updates its own state", () => {
    const sfx = silentSfx();
    let muted = false;
    sfx.isMuted = () => muted;
    sfx.toggleMute = vi.fn(() => {
      muted = !muted;
      return muted;
    });

    const { $ } = mount({ sfx });
    $("#mute").click();

    expect(sfx.toggleMute).toHaveBeenCalled();
    expect($("#mute").getAttribute("aria-pressed")).toBe("true");
    expect($("#mute").getAttribute("aria-label")).toBe("Unmute sound");
  });

  it("reflects a mute persisted from a previous visit", () => {
    const sfx = silentSfx();
    sfx.isMuted = () => true;
    const { $ } = mount({ sfx });
    expect($("#mute").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("share card", () => {
  it("copies a spoiler-free card to the clipboard", async () => {
    const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
    const { $, app } = mount({
      clipboard,
      grade: () => Promise.resolve({ correct: true, bytes: 61, failedFixture: null }),
    });

    $("#query").value = "SELECT name FROM customers";
    await app.submit();
    $(".win-actions .button-primary").click();
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalled());

    const card = clipboard.writeText.mock.calls[0][0];
    expect(card).toContain("Terseql 2026-07-16");
    expect(card).toContain("61 bytes");
    expect(card).not.toContain("SELECT");
  });

  it("reports a denied clipboard rather than claiming success", async () => {
    const clipboard = { writeText: vi.fn(() => Promise.reject(new Error("denied"))) };
    const { $, app } = mount({
      clipboard,
      grade: () => Promise.resolve({ correct: true, bytes: 61, failedFixture: null }),
    });

    $("#query").value = "SELECT 1";
    await app.submit();
    $(".win-actions .button-primary").click();

    await vi.waitFor(() =>
      expect($(".win-actions .button-primary").textContent).toBe("Copy failed"),
    );
  });

  it("survives an environment with no clipboard API at all", async () => {
    const { $, app } = mount({
      clipboard: undefined,
      grade: () => Promise.resolve({ correct: true, bytes: 61, failedFixture: null }),
    });

    $("#query").value = "SELECT 1";
    await app.submit();
    expect(() => $(".win-actions .button-primary").click()).not.toThrow();
  });
});
