// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, dedent } from "../src/app.js";
import { recordSolve } from "../src/leaderboard.js";
import { dayOne } from "../src/puzzles/day-0001.js";
import { puzzles } from "../src/puzzles/index.js";

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

/** A promise the test resolves by hand, to control when a fake dependency lands. */
function deferred() {
  let resolve;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
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
    warm: vi.fn(() => Promise.resolve()),
    ...overrides,
  });
  return { root, app, $: (sel) => root.querySelector(sel) };
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("dedent", () => {
  it("strips the shared indentation a template literal leaves behind", () => {
    expect(dedent("\n    CREATE TABLE a (x);\n    CREATE TABLE b (y);\n  ")).toBe(
      "CREATE TABLE a (x);\nCREATE TABLE b (y);",
    );
  });

  it("preserves relative indentation inside the block", () => {
    expect(dedent("\n    CREATE TABLE a (\n      x INTEGER\n    );\n")).toBe(
      "CREATE TABLE a (\n  x INTEGER\n);",
    );
  });

  it("ignores blank lines when measuring the shared indent", () => {
    expect(dedent("\n    a\n\n    b\n")).toBe("a\n\nb");
  });

  it("leaves already-flush text alone", () => {
    expect(dedent("SELECT 1")).toBe("SELECT 1");
  });

  it("handles empty and nullish input", () => {
    expect(dedent("")).toBe("");
    expect(dedent(null)).toBe("");
    expect(dedent(undefined)).toBe("");
  });

  it("renders every authored schema flush to the left margin", () => {
    for (const puzzle of puzzles) {
      const lines = dedent(puzzle.schemaSql).split("\n");
      expect(lines[0]).toBe(lines[0].trimStart());
      expect(lines.some((l) => l.startsWith("CREATE TABLE"))).toBe(true);
    }
  });
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

  it("gives the results panel a short live-region status, not the whole panel", () => {
    // A screen reader queuing an up-to-200-row table on every Run is
    // unusable — only a dedicated short summary node is announced.
    const { $ } = mount();
    const status = $("#results").querySelector('[aria-live="polite"]');
    expect(status).not.toBeNull();
    expect($("#results").getAttribute("aria-live")).toBeNull();
  });

  it("warms the WASM engine at mount, before the player's first Run", () => {
    const warm = vi.fn(() => Promise.resolve());
    mount({ warm });
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("mounts fine when warming the engine fails", () => {
    // The warmup is a head start, not a dependency.
    expect(() => mount({ warm: () => Promise.reject(new Error("no wasm")) })).not.toThrow();
  });

  it("advertises both the Run and Submit keyboard shortcuts, not just Run", () => {
    // Submit is the scored action — the undiscoverable one shouldn't be the
    // one left out of the hint.
    const { $ } = mount();
    expect($("#editor-hint").textContent).toContain("Enter to run");
    expect($("#editor-hint").textContent).toContain("Shift + Enter to submit");
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

  it("shows the newest run's result even when an older run resolves last", async () => {
    // Queries are raced, not queued: an expensive first query can land after
    // a cheap second one, and the table must never fall back to the stale
    // answer for a query the editor no longer holds.
    const slow = deferred();
    const fast = deferred();
    const execute = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { $, app } = mount({ execute });

    $("#query").value = "SELECT 1";
    const first = app.run();
    const second = app.run();

    fast.resolve({ ok: true, result: { columns: ["fresh"], values: [[2]] } });
    await second;
    slow.resolve({ ok: true, result: { columns: ["stale"], values: [[1]] } });
    await first;

    expect($("#results").textContent).toContain("fresh");
    expect($("#results").textContent).not.toContain("stale");
  });

  it("does not let a run in flight paint over a verdict that landed later", async () => {
    // Both loops write the same panel. A Run fired before a Submit but
    // resolving after it must not erase the grade the player asked for.
    const slow = deferred();
    const { $, app } = mount({
      execute: vi.fn(() => slow.promise),
      grade: () => Promise.resolve({ correct: false, bytes: 10, failedFixture: "hidden-1" }),
    });

    $("#query").value = "SELECT 1";
    const running = app.run();
    await app.submit();
    expect($("#results").dataset.state).toBe("error");

    slow.resolve({ ok: true, result: { columns: ["late"], values: [[1]] } });
    await running;

    expect($("#results").dataset.state).toBe("error");
    expect($("#results").textContent).not.toContain("late");
  });

  it("replaces a stale Running… panel once an outraced Run's verdict passes", async () => {
    // Click Run, click Submit before it resolves, submit a correct query: the
    // panel must not still read "Running…" once the passing Submit lands.
    const slowRun = deferred();
    const execute = vi
      .fn()
      .mockImplementationOnce(() => slowRun.promise)
      .mockImplementation(() =>
        Promise.resolve({ ok: true, result: { columns: ["a"], values: [[1]] } }),
      );
    const { $, app } = mount({
      execute,
      grade: () => Promise.resolve({ correct: true, bytes: 61, failedFixture: null }),
    });

    $("#query").value = "SELECT 1";
    const running = app.run();
    expect($("#results").dataset.state).toBe("running");

    await app.submit();
    expect($("#results").dataset.state).toBe("result");

    slowRun.resolve({ ok: true, result: { columns: ["stale"], values: [[99]] } });
    await running;

    expect($("#results").dataset.state).toBe("result");
    expect($("#results").textContent).not.toContain("stale");
  });
});

describe("submit", () => {
  const passing = { correct: true, bytes: 61, failedFixture: null };

  it("does nothing but reset to idle on an empty query", async () => {
    const grade = vi.fn();
    const { $, app } = mount({ grade });

    $("#query").value = "   ";
    await app.submit();

    expect(grade).not.toHaveBeenCalled();
    expect($("#results").dataset.state).toBe("idle");
  });

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

  it("paints the query's own result into the panel, not just idle plus a flash", async () => {
    // A bare Submit — no Run first — must not leave "Nothing run yet" behind
    // its own passing verdict; flash() is a decoration on real content, not a
    // substitute for it.
    const execute = vi.fn(() =>
      Promise.resolve({ ok: true, result: { columns: ["name"], values: [["Ada"]] } }),
    );
    const { $, app } = mount({ execute, grade: () => Promise.resolve(passing) });

    $("#query").value = "SELECT 1";
    await app.submit();

    expect($("#results").dataset.state).toBe("result");
    expect($("#results").textContent).toContain("Ada");
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

  it("headlines a first solve, an improvement, a tie and a longer resubmit", async () => {
    const grade = vi
      .fn()
      .mockResolvedValueOnce({ correct: true, bytes: 74, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 61, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 61, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 80, failedFixture: null });
    const { $, app } = mount({ grade });
    $("#query").value = "SELECT 1";

    await app.submit();
    expect($(".win-title").textContent).toBe("Solved");

    await app.submit();
    expect($(".win-title").textContent).toBe("Shorter");

    // A correct query that ties or loses to your best is still a solve, but
    // the headline must not congratulate you for a byte you didn't save.
    await app.submit();
    expect($(".win-title").textContent).toBe("Matched");
    expect($(".win-delta").textContent).toBe("Matched your best");

    await app.submit();
    expect($(".win-title").textContent).toBe("Still solved");
    expect($(".win-delta").textContent).toBe("19 over your best of 61");
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

  it('keys the visible-vs-hidden message off fixtures[0], not the literal name "preview"', async () => {
    // schema.js documents the convention positionally ("index 0 may equal
    // the preview"); a magic-string check on the literal name "preview"
    // would silently mislabel a puzzle whose visible fixture is named
    // anything else.
    const puzzle = {
      ...dayOne,
      fixtures: [{ ...dayOne.fixtures[0], name: "visible-sample" }, ...dayOne.fixtures.slice(1)],
    };
    const grade = () =>
      Promise.resolve({ correct: false, bytes: 30, failedFixture: "visible-sample" });
    const { $, app } = mount({ puzzle, grade });

    $("#query").value = "SELECT 1";
    await app.submit();
    expect($("#results").textContent).toContain("sample data you can see");
  });

  it("shows a designed error state and re-enables the button when grading throws", async () => {
    // executeQuery (Run) catches everything and degrades to a designed error
    // panel. grade() rejecting — the engine itself failing, not the query
    // being wrong — must get the same treatment from Submit: no unhandled
    // rejection escaping the click handler, no button stuck on "Grading…".
    const sfx = silentSfx();
    const { $, app } = mount({ sfx, grade: () => Promise.reject(new Error("engine died")) });

    $("#query").value = "SELECT 1";
    await expect(app.submit()).resolves.toBeUndefined();

    expect($("#results").dataset.state).toBe("error");
    expect($("#submit").disabled).toBe(false);
    expect($("#submit").textContent).toBe("Submit");
    expect(sfx.play).toHaveBeenCalledWith("fail");
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

  it("grades once when the submit shortcut is mashed", async () => {
    // The disabled button guards the click path; the keyboard path calls
    // submit() directly and has to be guarded on its own. Ungated, a mash
    // posts the same solve to the public board once per keypress.
    const leaderboard = {
      isEnabled: () => true,
      submit: vi.fn(() => Promise.resolve({ ok: true })),
      fetchTop: vi.fn(() => Promise.resolve({ ok: true, entries: [] })),
    };
    const grade = vi.fn(() => Promise.resolve(passing));
    const { $ } = mount({ grade, leaderboard });

    $("#query").value = "SELECT 1";
    for (let i = 0; i < 3; i++) {
      $("#query").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, shiftKey: true }),
      );
    }
    await vi.waitFor(() => expect(leaderboard.submit).toHaveBeenCalled());

    expect(grade).toHaveBeenCalledTimes(1);
    expect(leaderboard.submit).toHaveBeenCalledTimes(1);
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

  it("only posts a solve that beats your own best", async () => {
    const leaderboard = {
      isEnabled: () => true,
      submit: vi.fn(() => Promise.resolve({ ok: true })),
      fetchTop: vi.fn(() => Promise.resolve({ ok: true, entries: [] })),
    };
    const grade = vi
      .fn()
      .mockResolvedValueOnce({ correct: true, bytes: 61, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 80, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 61, failedFixture: null })
      .mockResolvedValueOnce({ correct: true, bytes: 55, failedFixture: null });
    const { $, app } = mount({ leaderboard, grade });

    $("#query").value = "SELECT 1";
    await app.submit();
    await vi.waitFor(() => expect(leaderboard.submit).toHaveBeenCalledTimes(1));

    // Worse than, then equal to, the best already posted: the board already
    // knows the 61, so neither is news.
    await app.submit();
    await app.submit();
    expect(leaderboard.submit).toHaveBeenCalledTimes(1);

    await app.submit();
    await vi.waitFor(() => expect(leaderboard.submit).toHaveBeenCalledTimes(2));
    expect(leaderboard.submit).toHaveBeenLastCalledWith({
      puzzleId: dayOne.id,
      bytes: 55,
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

  it("does not let an early, slower board fetch overwrite a later, faster one", async () => {
    // The mount-time refreshBoard() can still be in flight when a fast solve
    // fires the post-submit one; this is the same race `latestRequest`
    // already solves for the results panel, applied to the board.
    const slow = deferred();
    const fast = deferred();
    const fetchTop = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const leaderboard = { isEnabled: () => true, submit: vi.fn(), fetchTop };
    const { $, app } = mount({ leaderboard }); // mount() itself fires the first (slow) refresh

    const second = app.refreshBoard();
    fast.resolve({ ok: true, entries: [{ bytes: 49, name: "fresh" }] });
    await second;

    slow.resolve({ ok: true, entries: [{ bytes: 90, name: "stale" }] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect($("#board").textContent).toContain("fresh");
    expect($("#board").textContent).not.toContain("stale");
  });
});

describe("streak", () => {
  it("stays hidden for a player with no streak", () => {
    const { $ } = mount();
    expect($("#streak").hidden).toBe(true);
  });

  it("surfaces a streak of two or more days", () => {
    recordSolve("2026-07-15", 40, "2026-07-15T10:00:00Z");
    recordSolve("2026-07-16", 38, "2026-07-16T10:00:00Z");
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
