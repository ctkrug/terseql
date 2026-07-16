import "./style.css";
import { createSeededDatabase } from "./db.js";
import { byteLength } from "./grader.js";
import { getBest } from "./leaderboard.js";
import { getTodaysPuzzle } from "./puzzles/index.js";

const puzzle = getTodaysPuzzle();
const app = document.getElementById("app");

app.innerHTML = `
  <main class="puzzle">
    <header class="puzzle-header">
      <h1 class="display">Terseql</h1>
      <p class="puzzle-title">${puzzle.title}</p>
    </header>

    <section class="puzzle-prompt">
      <p>${puzzle.prompt}</p>
      <details>
        <summary>Schema</summary>
        <pre>${puzzle.schemaSql.trim()}</pre>
      </details>
    </section>

    <section class="puzzle-editor">
      <textarea id="query" rows="4" spellcheck="false" placeholder="SELECT ..."></textarea>
      <div class="editor-footer">
        <span id="byte-count" class="byte-count">0 bytes</span>
        <button id="run">Run</button>
      </div>
    </section>

    <section class="puzzle-results">
      <div id="results" aria-live="polite"></div>
    </section>
  </main>
`;

const queryEl = document.getElementById("query");
const byteCountEl = document.getElementById("byte-count");
const resultsEl = document.getElementById("results");
const runButton = document.getElementById("run");

const best = getBest(puzzle.id);
if (best) {
  byteCountEl.title = `Your best: ${best.bytes} bytes`;
}

function updateByteCount() {
  byteCountEl.textContent = `${byteLength(queryEl.value)} bytes`;
}

function renderResult(result) {
  if (!result.columns.length) {
    resultsEl.innerHTML = '<p class="empty">No rows returned.</p>';
    return;
  }
  const head = result.columns.map((col) => `<th>${col}</th>`).join("");
  const rows = result.values
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("");
  resultsEl.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

async function runQuery() {
  const query = queryEl.value.trim();
  if (!query) {
    resultsEl.innerHTML = '<p class="empty">Write a query above, then hit Run.</p>';
    return;
  }
  try {
    const db = await createSeededDatabase(puzzle.previewSetupSql);
    try {
      const [result] = db.exec(query);
      renderResult(result ?? { columns: [], values: [] });
    } finally {
      db.close();
    }
  } catch (err) {
    resultsEl.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

queryEl.addEventListener("input", updateByteCount);
runButton.addEventListener("click", runQuery);

updateByteCount();
