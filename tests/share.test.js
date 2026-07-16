import { describe, expect, it } from "vitest";
import { formatShareCard, SHARE_URL } from "../src/share.js";

const base = { puzzleId: "2026-07-16", title: "Top Spenders", trail: [96, 74, 61] };

describe("formatShareCard", () => {
  it("leads with the puzzle date and title", () => {
    expect(formatShareCard(base).split("\n")[0]).toBe("Terseql 2026-07-16 — Top Spenders");
  });

  it("renders one bar per improvement, shrinking toward the best", () => {
    const bars = formatShareCard(base)
      .split("\n")
      .filter((line) => /^[🟦🟩]/u.test(line));
    expect(bars).toHaveLength(3);

    const widths = bars.map((line) => [...line].filter((c) => c === "🟦" || c === "🟩").length);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it("marks only the best row green", () => {
    const bars = formatShareCard(base)
      .split("\n")
      .filter((line) => /^[🟦🟩]/u.test(line));
    expect(bars[0].startsWith("🟦")).toBe(true);
    expect(bars[2].startsWith("🟩")).toBe(true);
    expect(bars.filter((b) => b.startsWith("🟩"))).toHaveLength(1);
  });

  it("reports the best byte count and the number of cuts", () => {
    expect(formatShareCard(base)).toContain("61 bytes (3 cuts)");
  });

  it("omits the cut count for a one-shot solve", () => {
    const card = formatShareCard({ ...base, trail: [61] });
    expect(card).toContain("61 bytes");
    expect(card).not.toContain("cuts");
  });

  it("shows a streak of 2 or more", () => {
    expect(formatShareCard({ ...base, streak: 4 })).toContain("🔥 4-day streak");
  });

  it("omits a streak of 1, which isn't a streak worth bragging about", () => {
    expect(formatShareCard({ ...base, streak: 1 })).not.toContain("streak");
    expect(formatShareCard({ ...base, streak: 0 })).not.toContain("streak");
  });

  it("ends with the share URL", () => {
    expect(formatShareCard(base).endsWith(SHARE_URL)).toBe(true);
  });

  it("never leaks query text — the card is bytes and emoji only", () => {
    const card = formatShareCard({ ...base, query: "SELECT name FROM customers" });
    expect(card).not.toContain("SELECT");
    expect(card).not.toContain("customers");
  });

  it("renders a single-solve trail as one full-width green bar", () => {
    const bars = formatShareCard({ ...base, trail: [61] })
      .split("\n")
      .filter((line) => /^[🟦🟩]/u.test(line));
    expect(bars).toHaveLength(1);
    expect([...bars[0]].filter((c) => c === "🟩")).toHaveLength(10);
  });

  it("keeps a tiny final bar visible rather than rendering zero blocks", () => {
    // 3 bytes against a 200-byte start rounds to 0 blocks without a floor.
    const bars = formatShareCard({ ...base, trail: [200, 3] })
      .split("\n")
      .filter((line) => /^[🟦🟩]/u.test(line));
    expect([...bars[1]].filter((c) => c === "🟩").length).toBeGreaterThanOrEqual(1);
  });

  it("handles a zero-byte worst case without dividing by zero", () => {
    expect(() => formatShareCard({ ...base, trail: [0] })).not.toThrow();
  });

  it("rejects an empty trail rather than emitting a card with no score", () => {
    expect(() => formatShareCard({ ...base, trail: [] })).toThrow(/trail/);
    expect(() => formatShareCard({ ...base, trail: undefined })).toThrow(/trail/);
  });

  describe("a long trail", () => {
    // A determined golfer trims one byte at a time; nothing caps how many
    // improvements a trail holds. The card is made to be pasted into a group
    // chat, so it has to stay a glanceable staircase, not a 20-line wall.
    const long = Array.from({ length: 20 }, (_, i) => 80 - i); // 80 → 61
    const barsOf = (card) => card.split("\n").filter((line) => /^[🟦🟩]/u.test(line));

    it("stays compact instead of printing a row per cut", () => {
      const bars = barsOf(formatShareCard({ ...base, trail: long }));
      expect(bars.length).toBeLessThanOrEqual(8);
    });

    it("still shows where you started and where you landed", () => {
      const bars = barsOf(formatShareCard({ ...base, trail: long }));
      expect(bars[0]).toContain("80");
      expect(bars[bars.length - 1]).toContain("61");
      expect([...bars[bars.length - 1]].filter((c) => c === "🟩").length).toBeGreaterThanOrEqual(1);
    });

    it("reports the true number of cuts even though it elides rows", () => {
      const card = formatShareCard({ ...base, trail: long });
      expect(card).toContain("61 bytes (20 cuts)");
    });

    it("leaves a trail that already fits completely untouched", () => {
      expect(barsOf(formatShareCard({ ...base, trail: [96, 74, 61] }))).toHaveLength(3);
    });
  });
});
