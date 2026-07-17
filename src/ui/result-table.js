const MAX_ROWS_RENDERED = 200;

/**
 * Format one SQLite cell for display.
 *
 * NULL is rendered as a muted literal rather than an empty cell — in a golf
 * puzzle the difference between NULL and '' is often the whole point, so the
 * table must never blur them.
 *
 * @param {unknown} value
 * @returns {{text: string, className: string}}
 */
export function formatCell(value) {
  if (value === null || value === undefined) return { text: "NULL", className: "cell-null" };
  if (typeof value === "number") return { text: String(value), className: "cell-number" };
  if (value instanceof Uint8Array) return { text: `blob(${value.length})`, className: "cell-blob" };
  return { text: String(value), className: "cell-text" };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The live result panel: everything the player sees after hitting Run.
 *
 * Cells are written with textContent, never innerHTML. The player's own query
 * decides what comes back, so a row containing markup is entirely reachable —
 * `SELECT '<img onerror=...>'` — and must render as the literal text it is.
 *
 * The `aria-live` region is a short, dedicated status line — NOT the panel
 * itself. A 200-row table is visible content, not an announcement: an
 * `aria-live` region that contains the table queues the whole thing for a
 * screen reader on every Run, which is unusable at any real row count. The
 * body (table, error copy, empty/idle state) renders outside the live
 * region; only a one-line summary is ever announced.
 *
 * @param {HTMLElement} root
 */
export function createResultPanel(root) {
  if (!root) throw new Error("createResultPanel needs a root element");

  const status = el("p", "visually-hidden");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(status);

  const body = el("div", "results-body");
  root.append(body);

  function replace(...children) {
    body.textContent = "";
    body.append(...children);
  }

  function announce(text) {
    status.textContent = text;
  }

  function state(name) {
    root.dataset.state = name;
  }

  let flashTimer = null;

  function showEmpty() {
    state("empty");
    announce("0 rows");
    const wrap = el("div", "panel-state");
    wrap.append(
      el("p", "panel-state-title", "0 rows"),
      el("p", "panel-state-hint", "The query ran fine — it just matched nothing."),
    );
    replace(wrap);
  }

  return {
    /** Before the first run. */
    showIdle() {
      state("idle");
      announce("");
      const wrap = el("div", "panel-state");
      wrap.append(
        el("p", "panel-state-title", "Nothing run yet"),
        el(
          "p",
          "panel-state-hint",
          "Write a query and hit Run — it executes right here, instantly.",
        ),
      );
      replace(wrap);
    },

    showRunning() {
      state("running");
      announce("Running…");
      replace(el("p", "panel-state-title", "Running…"));
    },

    /**
     * A query that returned no rows at all — distinct from an error, and a
     * legitimate answer for some puzzles.
     */
    showEmpty,

    /**
     * @param {{columns: string[], values: any[][]}} result
     */
    showResult(result) {
      if (!result || !result.columns?.length) return showEmpty();

      state("result");
      const table = el("table", "result-table");

      const headRow = el("tr");
      result.columns.forEach((col) => headRow.append(el("th", null, String(col))));
      const thead = el("thead");
      thead.append(headRow);

      const tbody = el("tbody");
      const rows = result.values.slice(0, MAX_ROWS_RENDERED);
      rows.forEach((row, i) => {
        const tr = el("tr");
        // Staggered row-in, capped so a 200-row result doesn't take 20s to
        // finish arriving. CSS drops this under prefers-reduced-motion.
        tr.style.setProperty("--row-index", String(Math.min(i, 12)));
        row.forEach((cell) => {
          const { text, className } = formatCell(cell);
          tr.append(el("td", className, text));
        });
        tbody.append(tr);
      });

      table.append(thead, tbody);

      const total = result.values.length;
      const shown = rows.length;
      const summary =
        total > shown
          ? `${shown} of ${total} rows shown`
          : `${total} ${total === 1 ? "row" : "rows"}`;

      announce(summary);
      replace(table, el("p", "result-meta", summary));
    },

    /**
     * A SQLite error — a syntax slip, a bad column. Shown as a designed state
     * in the panel; it is never thrown, and never a blank screen.
     * @param {string} message
     */
    showError(message) {
      state("error");
      const text = String(message || "Unknown error");
      announce(`SQLite says no: ${text}`);
      const wrap = el("div", "panel-state panel-state-error");
      wrap.append(
        el("p", "panel-state-title", "SQLite says no"),
        el("p", "panel-error-message", text),
      );
      replace(wrap);
    },

    /**
     * One beat of colored edge feedback: "pass" pulses green, "fail" flashes
     * red. Purely decorative — the panel's content already says what happened.
     * @param {"pass"|"fail"} kind
     */
    flash(kind) {
      const className = kind === "pass" ? "flash-pass" : "flash-fail";
      root.classList.remove("flash-pass", "flash-fail");
      void root.offsetWidth; // reflow so a repeat flash re-triggers
      root.classList.add(className);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => root.classList.remove(className), 600);
    },

    getState: () => root.dataset.state,

    /** Cancel the pending flash timer — used when tearing the page down. */
    destroy() {
      clearTimeout(flashTimer);
    },
  };
}
