// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWinOverlay, describeDelta } from "../src/ui/win-overlay.js";

let root;
beforeEach(() => {
  document.body.innerHTML = '<textarea id="editor"></textarea><div id="win" hidden></div>';
  root = document.getElementById("win");
});

const overlay = (options) =>
  createWinOverlay(root, { prefersReducedMotion: () => true, ...options });

describe("describeDelta", () => {
  it("calls a first solve a first solve", () => {
    expect(describeDelta(61, undefined)).toEqual({ kind: "first", delta: 0, text: "First solve" });
    expect(describeDelta(61, null).kind).toBe("first");
  });

  it("reports an improvement in bytes saved", () => {
    expect(describeDelta(61, 74)).toEqual({
      kind: "improved",
      delta: 13,
      text: "13 bytes shorter",
    });
  });

  it("uses the singular for a one-byte cut", () => {
    expect(describeDelta(60, 61).text).toBe("1 byte shorter");
  });

  it("reports a tie", () => {
    expect(describeDelta(61, 61)).toEqual({ kind: "tied", delta: 0, text: "Matched your best" });
  });

  it("reports a longer solve against the standing best", () => {
    expect(describeDelta(74, 61)).toEqual({
      kind: "worse",
      delta: -13,
      text: "13 over your best of 61",
    });
  });

  it("handles a zero previous best without treating it as absent", () => {
    expect(describeDelta(5, 0).kind).toBe("worse");
  });
});

describe("createWinOverlay", () => {
  it("requires a root element", () => {
    expect(() => createWinOverlay(null)).toThrow(/root element/);
  });

  it("starts closed", () => {
    expect(overlay().isOpen()).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it("shows the byte count and the personal-best delta", () => {
    overlay().show({ bytes: 61, previousBest: 74 });

    expect(root.hidden).toBe(false);
    expect(root.querySelector(".win-bytes").textContent).toBe("61");
    expect(root.querySelector(".win-delta").textContent).toBe("13 bytes shorter");
  });

  it("shows a first solve without inventing a delta", () => {
    overlay().show({ bytes: 61 });
    expect(root.querySelector(".win-delta").textContent).toBe("First solve");
  });

  it("shows a streak of 2 or more but not of 1", () => {
    overlay().show({ bytes: 61, streak: 3 });
    expect(root.textContent).toContain("🔥 3-day streak");

    overlay().show({ bytes: 61, streak: 1 });
    expect(root.textContent).not.toContain("streak");
  });

  it("is a labelled modal dialog", () => {
    overlay().show({ bytes: 61 });
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("win-title");
    expect(root.querySelector("#win-title")).not.toBeNull();
  });

  it("gives the icon-only close button an accessible name", () => {
    overlay().show({ bytes: 61 });
    expect(root.querySelector(".win-close").getAttribute("aria-label")).toBe("Close");
  });

  it("moves focus into the overlay on open", () => {
    overlay().show({ bytes: 61 });
    expect(root.contains(document.activeElement)).toBe(true);
  });

  it("returns focus to the editor on close so you can keep golfing", () => {
    const editor = document.getElementById("editor");
    editor.focus();

    const win = overlay();
    win.show({ bytes: 61 });
    win.close();

    expect(document.activeElement).toBe(editor);
  });
});

describe("dismissal", () => {
  it("closes on the close button", () => {
    const win = overlay();
    win.show({ bytes: 61 });
    root.querySelector(".win-close").click();

    expect(win.isOpen()).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it("closes on the Keep golfing button", () => {
    const win = overlay();
    win.show({ bytes: 61 });
    root.querySelector(".button-ghost").click();
    expect(win.isOpen()).toBe(false);
  });

  it("closes on Escape", () => {
    const win = overlay();
    win.show({ bytes: 61 });
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(win.isOpen()).toBe(false);
  });

  it("ignores other keys", () => {
    const win = overlay();
    win.show({ bytes: 61 });
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(win.isOpen()).toBe(true);
  });

  it("notifies on close, and dismissing does not undo the solve", () => {
    const onClose = vi.fn();
    const win = overlay({ onClose });
    win.show({ bytes: 61 });
    win.close();

    // The overlay reports the close and owns no solve state of its own.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(win.isOpen()).toBe(false);
  });

  it("is safe to close twice", () => {
    const onClose = vi.fn();
    const win = overlay({ onClose });
    win.show({ bytes: 61 });
    win.close();
    win.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reopens after a closed run", () => {
    const win = overlay();
    win.show({ bytes: 61 });
    win.close();
    win.show({ bytes: 60 });

    expect(win.isOpen()).toBe(true);
    expect(root.querySelector(".win-bytes").textContent).toBe("60");
  });
});

describe("share card copy", () => {
  it("confirms a successful copy, then resets the label", async () => {
    vi.useFakeTimers();
    const onCopyShare = vi.fn(() => true);
    overlay({ onCopyShare }).show({ bytes: 61 });

    const button = root.querySelector(".button-primary");
    button.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(onCopyShare).toHaveBeenCalled();
    expect(button.textContent).toBe("Copied!");

    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toBe("Copy share card");
    vi.useRealTimers();
  });

  it("says so when the copy fails rather than lying", async () => {
    vi.useFakeTimers();
    overlay({ onCopyShare: () => Promise.resolve(false) }).show({ bytes: 61 });

    const button = root.querySelector(".button-primary");
    button.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(button.textContent).toBe("Copy failed");
    vi.useRealTimers();
  });
});

describe("particles", () => {
  it("bursts motes by default", () => {
    createWinOverlay(root, { prefersReducedMotion: () => false }).show({ bytes: 61 });
    expect(root.querySelectorAll(".mote").length).toBeGreaterThan(0);
    expect(root.querySelector(".win-particles").getAttribute("aria-hidden")).toBe("true");
  });

  it("drops them entirely under prefers-reduced-motion, keeping the content", () => {
    createWinOverlay(root, { prefersReducedMotion: () => true }).show({ bytes: 61 });
    expect(root.querySelectorAll(".mote")).toHaveLength(0);
    expect(root.querySelector(".win-bytes").textContent).toBe("61");
  });
});
