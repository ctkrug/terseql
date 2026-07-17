// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { UNAVAILABLE } from "../src/remote-leaderboard.js";
import { createLeaderboardPanel } from "../src/ui/leaderboard-panel.js";

let root;
let panel;
beforeEach(() => {
  document.body.innerHTML = '<aside id="board"></aside>';
  root = document.getElementById("board");
  panel = createLeaderboardPanel(root);
});

const rows = () =>
  [...root.querySelectorAll(".board-row")].map((li) => ({
    rank: li.querySelector(".board-rank").textContent,
    name: li.querySelector(".board-name").textContent,
    bytes: li.querySelector(".board-bytes").textContent,
  }));

describe("createLeaderboardPanel", () => {
  it("requires a root element", () => {
    expect(() => createLeaderboardPanel(null)).toThrow(/root element/);
  });

  it("has a loading state", () => {
    panel.showLoading();
    expect(panel.getState()).toBe("loading");
    expect(root.textContent).toContain("Loading");
  });
});

describe("entries", () => {
  const entries = [
    { bytes: 49, name: "grace" },
    { bytes: 61, name: "ada" },
    { bytes: 74, name: "alan" },
  ];

  it("renders ranked rows", () => {
    panel.showEntries(entries, { yourBest: 61 });
    expect(panel.getState()).toBe("entries");
    expect(rows()).toEqual([
      { rank: "1", name: "grace", bytes: "49" },
      { rank: "2", name: "ada", bytes: "61" },
      { rank: "3", name: "alan", bytes: "74" },
    ]);
  });

  it("marks the row matching your best so you can find yourself", () => {
    panel.showEntries(entries, { yourBest: 61 });
    const marked = [...root.querySelectorAll(".is-you")];
    expect(marked).toHaveLength(1);
    expect(marked[0].querySelector(".board-bytes").textContent).toBe("61");
  });

  it("marks only the first row on a tie", () => {
    panel.showEntries([{ bytes: 61 }, { bytes: 61 }], { yourBest: 61 });
    expect(root.querySelectorAll(".is-you")).toHaveLength(1);
  });

  it("marks nothing when you haven't solved today", () => {
    panel.showEntries(entries, { yourBest: null });
    expect(root.querySelectorAll(".is-you")).toHaveLength(0);
  });

  it("shows your best alongside the board", () => {
    panel.showEntries(entries, { yourBest: 61 });
    expect(root.querySelector(".your-best-bytes").textContent).toBe("61");
  });

  it("shows a dash for your best before you've solved", () => {
    panel.showEntries(entries, { yourBest: null });
    expect(root.querySelector(".your-best-bytes").textContent).toBe("—");
  });

  it("falls back to anon for a nameless entry", () => {
    panel.showEntries([{ bytes: 49 }]);
    expect(rows()[0].name).toBe("anon");
  });

  it("renders a hostile name as text, not markup", () => {
    panel.showEntries([{ bytes: 49, name: "<img src=x onerror=alert(1)>" }]);
    expect(root.querySelector("img")).toBeNull();
    expect(rows()[0].name).toBe("<img src=x onerror=alert(1)>");
  });

  it("shows the empty state when the board has no scores yet", () => {
    panel.showEntries([], { yourBest: 61 });
    expect(panel.getState()).toBe("empty");
    expect(root.textContent).toContain("First blood");
    // Even empty, your own best still shows — the panel is never blank.
    expect(root.querySelector(".your-best-bytes").textContent).toBe("61");
  });

  it("replaces prior content rather than stacking", () => {
    panel.showEntries(entries);
    panel.showEntries([{ bytes: 49 }]);
    expect(rows()).toHaveLength(1);
  });

  it("still falls back to the empty state when showEntries is destructured off the panel", () => {
    // showEntries delegates to this.showEmpty(...), which breaks the moment
    // the panel object is pulled apart, the same shape as the bug fixed in
    // audio.js's toggleMute and result-table.js's showResult.
    const { showEntries } = panel;
    expect(() => showEntries([], { yourBest: 61 })).not.toThrow();
    expect(panel.getState()).toBe("empty");
  });
});

describe("unavailable states", () => {
  it.each([
    [UNAVAILABLE.NOT_CONFIGURED, "Solo mode"],
    [UNAVAILABLE.NETWORK, "Offline"],
    [UNAVAILABLE.TIMEOUT, "Board is slow"],
    [UNAVAILABLE.SERVER, "Board is down"],
    [UNAVAILABLE.MALFORMED, "Board is confused"],
  ])("gives %s designed copy rather than a blank panel", (reason, expectedTitle) => {
    panel.showUnavailable(reason, { yourBest: 61 });

    expect(panel.getState()).toBe("unavailable");
    expect(root.querySelector(".panel-state-title").textContent).toBe(expectedTitle);
    expect(root.querySelector(".panel-state-hint").textContent.length).toBeGreaterThan(0);
  });

  it("degrades to showing your local best when the board is unreachable", () => {
    panel.showUnavailable(UNAVAILABLE.NETWORK, { yourBest: 61 });
    expect(root.querySelector(".your-best-bytes").textContent).toBe("61");
  });

  it("records the reason for styling and debugging", () => {
    panel.showUnavailable(UNAVAILABLE.SERVER);
    expect(root.dataset.reason).toBe(UNAVAILABLE.SERVER);
  });

  it("still says something useful for an unrecognized reason", () => {
    panel.showUnavailable("something-new");
    expect(root.querySelector(".panel-state-title").textContent).toBe("Board unavailable");
  });

  it("still says something useful for a missing reason", () => {
    panel.showUnavailable(undefined);
    expect(root.querySelector(".panel-state-title").textContent).toBe("Board unavailable");
    expect(root.dataset.reason).toBe("unknown");
  });

  it("clears the reason once a later state isn't unavailable", () => {
    // An offline refresh followed by a good one must not leave
    // data-state="entries" data-reason="network" — an attribute
    // contradicting the state it's attached to.
    panel.showUnavailable(UNAVAILABLE.NETWORK);
    expect(root.dataset.reason).toBe(UNAVAILABLE.NETWORK);

    panel.showEntries([{ bytes: 61, name: "ada" }]);
    expect(root.dataset.reason).toBeUndefined();
  });

  it("never sets a reason on loading or empty states", () => {
    panel.showUnavailable(UNAVAILABLE.NETWORK);
    panel.showLoading();
    expect(root.dataset.reason).toBeUndefined();

    panel.showUnavailable(UNAVAILABLE.NETWORK);
    panel.showEmpty();
    expect(root.dataset.reason).toBeUndefined();
  });
});
