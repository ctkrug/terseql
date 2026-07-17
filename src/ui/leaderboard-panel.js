import { UNAVAILABLE } from "../remote-leaderboard.js";

/**
 * Player-facing copy for each way the board can be unavailable. Every reason
 * gets real words: a blank panel reads as broken, and "we're not sure" is
 * worse than "there's no shared board yet — here's your own best."
 */
const UNAVAILABLE_COPY = {
  [UNAVAILABLE.NOT_CONFIGURED]: {
    title: "Solo mode",
    hint: "No shared board yet — you're golfing against your own best.",
  },
  [UNAVAILABLE.NETWORK]: {
    title: "Offline",
    hint: "Can't reach the board. Your solves still count locally.",
  },
  [UNAVAILABLE.TIMEOUT]: {
    title: "Board is slow",
    hint: "The leaderboard didn't answer in time. Your solves still count locally.",
  },
  [UNAVAILABLE.SERVER]: {
    title: "Board is down",
    hint: "The leaderboard is having a moment. Your solves still count locally.",
  },
  [UNAVAILABLE.MALFORMED]: {
    title: "Board is confused",
    hint: "The leaderboard sent something unreadable. Your solves still count locally.",
  },
};

const FALLBACK_COPY = {
  title: "Board unavailable",
  hint: "Your solves still count locally.",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Your personal best, rendered in the support accent (amber) so it reads as
 * yours against the cyan of everyone else's — per the design tokens, amber is
 * reserved for exactly this.
 */
function yourBestRow(yourBest) {
  const row = el("p", "your-best");
  row.append(
    el("span", "your-best-label", "Your best"),
    el(
      "span",
      "your-best-bytes",
      yourBest === null || yourBest === undefined ? "—" : String(yourBest),
    ),
  );
  return row;
}

/**
 * The daily leaderboard panel.
 * @param {HTMLElement} root
 */
export function createLeaderboardPanel(root) {
  if (!root) throw new Error("createLeaderboardPanel needs a root element");

  function replace(state, ...children) {
    root.dataset.state = state;
    // Only showUnavailable's caller re-adds this — every other state must
    // not carry a reason forward from whatever state came before it.
    delete root.dataset.reason;
    root.textContent = "";
    root.append(...children);
  }

  return {
    getState: () => root.dataset.state,

    showLoading() {
      replace("loading", el("p", "panel-state-title", "Loading today's board…"));
    },

    /**
     * @param {Array<{bytes: number, name?: string}>} entries
     * @param {Object} [options]
     * @param {number|null} [options.yourBest]
     */
    showEntries(entries, { yourBest = null } = {}) {
      if (!entries.length) return this.showEmpty({ yourBest });

      const list = el("ol", "board-list");
      let yourRowMarked = false;

      entries.forEach((entry, i) => {
        const item = el("li", "board-row");
        item.append(
          el("span", "board-rank", `${i + 1}`),
          el("span", "board-name", entry.name ?? "anon"),
          el("span", "board-bytes", String(entry.bytes)),
        );
        // Mark the first row matching your best, so you can find yourself.
        if (!yourRowMarked && yourBest !== null && entry.bytes === yourBest) {
          item.classList.add("is-you");
          yourRowMarked = true;
        }
        list.append(item);
      });

      replace("entries", el("p", "panel-label", "Today's shortest"), list, yourBestRow(yourBest));
    },

    /**
     * Nobody has posted a score yet — a designed state, not a blank area.
     */
    showEmpty({ yourBest = null } = {}) {
      const wrap = el("div", "panel-state");
      wrap.append(
        el("p", "panel-state-title", "First blood"),
        el("p", "panel-state-hint", "Nobody's posted a score today. Go set the bar."),
      );
      replace("empty", wrap, yourBestRow(yourBest));
    },

    /**
     * @param {string} reason - a value from UNAVAILABLE
     * @param {Object} [options]
     * @param {number|null} [options.yourBest]
     */
    showUnavailable(reason, { yourBest = null } = {}) {
      const copy = UNAVAILABLE_COPY[reason] ?? FALLBACK_COPY;
      const wrap = el("div", "panel-state panel-state-muted");
      wrap.append(el("p", "panel-state-title", copy.title), el("p", "panel-state-hint", copy.hint));

      replace("unavailable", wrap, yourBestRow(yourBest));
      root.dataset.reason = reason ?? "unknown";
    },
  };
}
