import "./style.css";
import { createApp } from "./app.js";
import { getTodaysPuzzle } from "./puzzles/index.js";

const root = document.getElementById("app");
const puzzle = getTodaysPuzzle();

if (puzzle) {
  createApp({ root, puzzle });
} else {
  // Unreachable while any puzzle is authored, but a blank page is the one
  // outcome that must never happen — say something instead.
  root.innerHTML = `
    <div class="fatal panel">
      <h1 class="display">No puzzle today</h1>
      <p>Something's wrong with the puzzle catalogue. Try again tomorrow.</p>
    </div>
  `;
}
