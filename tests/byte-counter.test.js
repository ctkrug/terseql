// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createByteCounter } from "../src/ui/byte-counter.js";

let root;
beforeEach(() => {
  document.body.innerHTML = '<div id="counter"></div>';
  root = document.getElementById("counter");
});

const digits = () => [...root.querySelectorAll(".digit")].map((d) => d.textContent).join("");
const rolling = () => [...root.querySelectorAll(".digit.is-rolling")];

describe("createByteCounter", () => {
  it("requires a root element", () => {
    expect(() => createByteCounter(null)).toThrow(/root element/);
  });

  it("renders each digit separately", () => {
    createByteCounter(root).setValue(61);
    expect(digits()).toBe("61");
    expect(root.querySelectorAll(".digit")).toHaveLength(2);
  });

  it("renders zero rather than an empty readout", () => {
    createByteCounter(root).setValue(0);
    expect(digits()).toBe("0");
  });

  it("reports whether the value actually changed", () => {
    const counter = createByteCounter(root);
    expect(counter.setValue(61)).toBe(true);
    expect(counter.setValue(61)).toBe(false);
    expect(counter.setValue(60)).toBe(true);
  });

  it("exposes the current value", () => {
    const counter = createByteCounter(root);
    counter.setValue(61);
    expect(counter.getValue()).toBe(61);
  });

  it("announces the count to screen readers", () => {
    createByteCounter(root).setValue(61);
    expect(root.getAttribute("aria-label")).toBe("61 bytes");
  });
});

describe("digit roll", () => {
  it("rolls only the digits that changed", () => {
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(61);
    counter.setValue(60);

    // The "6" held still; only the ones column moved.
    expect(rolling()).toHaveLength(1);
    expect(rolling()[0].textContent).toBe("0");
    expect(digits()).toBe("60");
  });

  it("rolls every digit that changed when several do", () => {
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(88);
    counter.setValue(61);
    expect(rolling()).toHaveLength(2);
  });

  it("does not roll on the very first render", () => {
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(61);
    expect(rolling()).toHaveLength(0);
  });

  it("clears the roll class once the animation window passes", async () => {
    vi.useFakeTimers();
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(61);
    counter.setValue(60);
    expect(rolling()).toHaveLength(1);

    vi.advanceTimersByTime(120);
    expect(rolling()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("re-triggers cleanly when a digit changes again mid-roll", () => {
    vi.useFakeTimers();
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(63);
    counter.setValue(62);
    vi.advanceTimersByTime(30); // still rolling
    counter.setValue(61);

    expect(rolling()).toHaveLength(1);
    expect(digits()).toBe("61");

    // The first roll's timer must not cancel the second roll early.
    vi.advanceTimersByTime(60);
    expect(rolling()).toHaveLength(1);
    vi.advanceTimersByTime(60);
    expect(rolling()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("rebuilds without rolling when the digit count changes", () => {
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(100);
    counter.setValue(99);
    expect(digits()).toBe("99");
    expect(rolling()).toHaveLength(0);
  });

  it("updates instantly with no roll under prefers-reduced-motion", () => {
    const counter = createByteCounter(root, { prefersReducedMotion: () => true });
    counter.setValue(61);
    counter.setValue(60);

    expect(digits()).toBe("60");
    expect(rolling()).toHaveLength(0);
  });

  it("reads prefers-reduced-motion per update, not once at construction", () => {
    let reduced = false;
    const counter = createByteCounter(root, { prefersReducedMotion: () => reduced });
    counter.setValue(63);
    counter.setValue(62);
    expect(rolling()).toHaveLength(1);

    reduced = true;
    counter.setValue(61);
    expect(rolling()).toHaveLength(0);
  });
});

describe("change notification", () => {
  it("fires on change, but not on the first render", () => {
    const onDigitChange = vi.fn();
    const counter = createByteCounter(root, { onDigitChange });

    counter.setValue(61);
    expect(onDigitChange).not.toHaveBeenCalled();

    counter.setValue(60);
    expect(onDigitChange).toHaveBeenCalledWith(60);
  });

  it("does not fire when the value is unchanged", () => {
    const onDigitChange = vi.fn();
    const counter = createByteCounter(root, { onDigitChange });
    counter.setValue(61);
    counter.setValue(61);
    expect(onDigitChange).not.toHaveBeenCalled();
  });
});

describe("bad input", () => {
  it("floors a fractional count", () => {
    const counter = createByteCounter(root);
    counter.setValue(61.7);
    expect(digits()).toBe("61");
  });

  it("clamps a negative count to zero", () => {
    const counter = createByteCounter(root);
    counter.setValue(-5);
    expect(digits()).toBe("0");
  });

  it("treats NaN as zero rather than rendering 'NaN'", () => {
    const counter = createByteCounter(root);
    counter.setValue(NaN);
    expect(digits()).toBe("0");
  });

  it("handles a large count", () => {
    const counter = createByteCounter(root);
    counter.setValue(123456);
    expect(digits()).toBe("123456");
  });
});

describe("destroy", () => {
  it("cancels pending roll timers", () => {
    vi.useFakeTimers();
    const counter = createByteCounter(root, { prefersReducedMotion: () => false });
    counter.setValue(61);
    counter.setValue(60);
    counter.destroy();

    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    vi.useRealTimers();
  });
});
