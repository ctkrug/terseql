import { createSeededDatabase } from "./db.js";
import { byteLength, gradeQuery } from "./grader.js";
import { getBest, getCurrentStreak, recordSolve } from "./leaderboard.js";
import { leaderboardClient } from "./remote-leaderboard.js";
import { formatShareCard } from "./share.js";
import { sfx as defaultSfx } from "./audio.js";
import { createByteCounter } from "./ui/byte-counter.js";
import { createLeaderboardPanel } from "./ui/leaderboard-panel.js";
import { createResultPanel } from "./ui/result-table.js";
import { createWinOverlay } from "./ui/win-overlay.js";

const BOARD_SIZE = 10;

/**
 * Strip the shared leading indentation from a template-literal SQL block.
 *
 * Puzzle files write `schemaSql` as an indented template literal, so every
 * line carries the source file's indentation. Rendered as-is, the schema
 * reads as a ragged staircase — and it's the thing the player stares at all
 * session, so it has to look like a drawing, not a paste.
 *
 * @param {string} text
 * @returns {string}
 */
export function dedent(text) {
  const lines = String(text ?? "").split("\n");
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)[0].length);
  const shared = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(shared))
    .join("\n")
    .trim();
}

/**
 * Run one query against a fresh copy of the puzzle's preview database.
 *
 * A new database every time, deliberately: the player is free to write
 * `DROP TABLE orders` or an INSERT, and the next Run must start from the same
 * ground truth rather than from their debris. Seeding is sub-millisecond once
 * the WASM engine is warm, so isolation costs nothing the player can feel.
 *
 * @returns {Promise<{ok: true, result: object} | {ok: false, error: string}>}
 */
export async function executeQuery(sql, setupSql) {
  let db;
  try {
    db = await createSeededDatabase(setupSql);
    const [result] = db.exec(sql);
    return { ok: true, result: result ?? { columns: [], values: [] } };
  } catch (err) {
    // SQLite errors are the common case here, not exceptional — a syntax slip
    // is part of golfing. They become a designed panel state, never a throw.
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    db?.close();
  }
}

function markup(puzzle, dateLabel) {
  return `
    <a class="skip-link" href="#query">Skip to the editor</a>

    <header class="topbar">
      <div class="wordmark">
        <span class="wordmark-mark" aria-hidden="true">&gt;_</span>
        <span class="wordmark-text">terse<span class="wordmark-accent">ql</span></span>
      </div>
      <div class="topbar-meta">
        <p class="topbar-date">${dateLabel}</p>
        <p class="streak" id="streak" hidden></p>
        <button
          type="button"
          id="mute"
          class="icon-button"
          aria-label="Mute sound"
          aria-pressed="false"
        >
          <span class="icon-sound" aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <main class="grid">
      <section class="col-brief panel" aria-labelledby="brief-title">
        <p class="panel-label">Today's puzzle</p>
        <h1 class="puzzle-title display" id="brief-title"></h1>
        <p class="puzzle-prompt" id="brief-prompt"></p>

        <div class="schema">
          <p class="panel-label">Schema</p>
          <pre class="schema-sql" id="brief-schema"></pre>
        </div>

        <p class="brief-note">
          Column names are ignored. Row and column order are not.
        </p>
      </section>

      <section class="col-instrument" aria-label="Query editor and results">
        <div class="editor panel">
          <div class="editor-head">
            <label class="panel-label" for="query">Your query</label>
            <div class="counter" id="byte-count" role="status" aria-live="polite"></div>
            <span class="counter-unit">bytes</span>
          </div>
          <textarea
            id="query"
            class="editor-input"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            placeholder="SELECT ..."
            aria-describedby="editor-hint"
          ></textarea>
          <div class="editor-actions">
            <p class="editor-hint" id="editor-hint">⌘/Ctrl + Enter to run</p>
            <button type="button" id="run" class="button-ghost">Run</button>
            <button type="button" id="submit" class="button-primary">Submit</button>
          </div>
        </div>

        <div class="results panel" id="results" role="status" aria-live="polite"></div>
      </section>

      <aside class="col-board panel" id="board" aria-label="Today's leaderboard"></aside>
    </main>

    <div class="win-overlay" id="win" hidden></div>
  `;
}

/**
 * Wire up the whole page.
 *
 * Dependencies are injectable so tests can drive the loop without a real
 * SQLite engine, network, clipboard or audio device.
 *
 * @param {Object} params
 * @param {HTMLElement} params.root
 * @param {import("./puzzles/schema.js").Puzzle} params.puzzle
 * @param {Date} [params.now]
 */
export function createApp({
  root,
  puzzle,
  now = new Date(),
  sfx = defaultSfx,
  leaderboard = leaderboardClient,
  clipboard = globalThis.navigator?.clipboard,
  execute = executeQuery,
  grade = gradeQuery,
} = {}) {
  if (!root) throw new Error("createApp needs a root element");
  if (!puzzle) throw new Error("createApp needs a puzzle");

  const dateLabel = new Date(`${puzzle.id}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  root.innerHTML = markup(puzzle, dateLabel);

  const $ = (id) => root.querySelector(`#${id}`);
  const editor = $("query");
  const runButton = $("run");
  const submitButton = $("submit");
  const muteButton = $("mute");
  const streakEl = $("streak");

  // Text, not markup: puzzle copy is authored, but there's no reason for the
  // page to be one typo in a puzzle file away from an injection.
  $("brief-title").textContent = puzzle.title;
  $("brief-prompt").textContent = puzzle.prompt;
  $("brief-schema").textContent = dedent(puzzle.schemaSql);

  const results = createResultPanel($("results"));
  const board = createLeaderboardPanel($("board"));
  const counter = createByteCounter($("byte-count"), {
    onDigitChange: () => sfx.play("keystroke"),
  });

  let solvedThisSession = false;

  const win = createWinOverlay($("win"), {
    onCopyShare: async () => {
      const best = getBest(puzzle.id);
      if (!best) return false;
      const card = formatShareCard({
        puzzleId: puzzle.id,
        title: puzzle.title,
        trail: best.trail ?? [best.bytes],
        streak: getCurrentStreak(now),
      });
      try {
        await clipboard?.writeText(card);
        return true;
      } catch {
        // Clipboard can be denied or missing (insecure context, old Safari).
        // The button says "Copy failed" rather than silently claiming success.
        return false;
      }
    },
  });

  function renderStreak() {
    const streak = getCurrentStreak(now);
    streakEl.hidden = streak < 2;
    streakEl.textContent = streak >= 2 ? `🔥 ${streak}-day streak` : "";
  }

  function renderMute() {
    const muted = sfx.isMuted();
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    muteButton.dataset.muted = String(muted);
  }

  function updateByteCount() {
    counter.setValue(byteLength(editor.value));
  }

  async function refreshBoard() {
    const yourBest = getBest(puzzle.id)?.bytes ?? null;
    if (!leaderboard.isEnabled()) {
      board.showUnavailable("not-configured", { yourBest });
      return;
    }
    board.showLoading();
    const response = await leaderboard.fetchTop(puzzle.id, BOARD_SIZE);
    if (response.ok) board.showEntries(response.entries, { yourBest });
    else board.showUnavailable(response.reason, { yourBest });
  }

  async function run() {
    const sql = editor.value.trim();
    if (!sql) {
      results.showIdle();
      return;
    }

    sfx.play("run");
    results.showRunning();

    const outcome = await execute(sql, puzzle.previewSetupSql);
    if (outcome.ok) {
      results.showResult(outcome.result);
    } else {
      results.showError(outcome.error);
      results.flash("fail");
      sfx.play("fail");
    }
  }

  async function submit() {
    const sql = editor.value.trim();
    if (!sql) {
      results.showIdle();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Grading…";
    try {
      const verdict = await grade(sql, puzzle);

      if (!verdict.correct) {
        results.flash("fail");
        sfx.play("fail");
        // Name the fixture, never its data — that's the hidden half of the
        // puzzle, and leaking it would hand over the edge case for free.
        results.showError(
          verdict.failedFixture === "preview"
            ? "Wrong on the sample data you can see."
            : "Passes the sample, but fails a hidden case.",
        );
        return;
      }

      const previousBest = getBest(puzzle.id)?.bytes ?? null;
      recordSolve(puzzle.id, verdict.bytes, now.toISOString());

      results.flash("pass");
      sfx.play(solvedThisSession ? "pass" : "win");
      solvedThisSession = true;

      renderStreak();
      win.show({
        bytes: verdict.bytes,
        previousBest,
        streak: getCurrentStreak(now),
        title: previousBest === null ? "Solved" : "Shorter",
      });

      // Fire-and-forget: a submission failing to reach the board must not
      // interfere with a solve that already counted locally.
      leaderboard
        .submit({ puzzleId: puzzle.id, bytes: verdict.bytes, timestamp: now.toISOString() })
        .then(() => refreshBoard())
        .catch(() => {});
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit";
    }
  }

  function onEditorKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) submit();
      else run();
    }
  }

  editor.addEventListener("input", updateByteCount);
  editor.addEventListener("keydown", onEditorKeydown);
  runButton.addEventListener("click", run);
  submitButton.addEventListener("click", submit);
  muteButton.addEventListener("click", () => {
    sfx.toggleMute();
    renderMute();
    sfx.play("run"); // audible confirmation that sound is back on
  });

  updateByteCount();
  renderStreak();
  renderMute();
  results.showIdle();
  refreshBoard();

  return {
    run,
    submit,
    refreshBoard,
    elements: { editor, runButton, submitButton, muteButton },
    destroy() {
      counter.destroy();
      win.destroy();
    },
  };
}
