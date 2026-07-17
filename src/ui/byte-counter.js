const ROLL_CLASS = "is-rolling";
const ROLL_MS = 90;

function prefersReducedMotionByDefault() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * The instrument-dial byte readout — the app's signature detail.
 *
 * Renders the count as individual digit elements so that only the digits that
 * actually changed animate. Trimming 61 to 60 rolls the last digit alone; the
 * "6" sits still. Rolling the whole number on every keystroke would read as a
 * flicker, not an instrument.
 *
 * Digits are compared right-aligned (ones against ones, tens against tens),
 * because that's the column a reader's eye tracks as the number shrinks.
 *
 * @param {HTMLElement} root
 * @param {Object} [options]
 * @param {() => boolean} [options.prefersReducedMotion]
 * @param {(bytes: number) => void} [options.onDigitChange] - fires with the
 *   new count when the rendered digits change, for the keystroke tick
 */
export function createByteCounter(root, options = {}) {
  if (!root) throw new Error("createByteCounter needs a root element");

  const { prefersReducedMotion = prefersReducedMotionByDefault, onDigitChange } = options;
  const timers = new Map();
  let value = null;

  function digitsOf(n) {
    return String(Math.max(0, Math.trunc(n)));
  }

  function render(next, previous) {
    const nextDigits = digitsOf(next);
    const prevDigits = previous === null ? "" : digitsOf(previous);
    const lengthChanged = nextDigits.length !== prevDigits.length;

    // Rebuild only when the digit count changes; otherwise reuse the elements
    // so a digit mid-roll isn't yanked out from under its own animation.
    if (lengthChanged || root.children.length !== nextDigits.length) {
      // Every span about to be detached takes its roll timer with it —
      // otherwise the timer keeps firing against a node no longer in the
      // document, and the Map keeps a dead reference for the rest of the
      // session.
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      root.textContent = "";
      for (const char of nextDigits) {
        const span = document.createElement("span");
        span.className = "digit";
        span.textContent = char;
        root.append(span);
      }
      return;
    }

    const animate = !prefersReducedMotion();
    [...nextDigits].forEach((char, i) => {
      const span = root.children[i];
      if (span.textContent === char) return;

      span.textContent = char;

      // Restart cleanly whether or not we're about to animate: a digit still
      // rolling from a previous update must not keep rolling once motion has
      // been reduced.
      clearTimeout(timers.get(span));
      span.classList.remove(ROLL_CLASS);
      if (!animate) return;

      void span.offsetWidth; // reflow, so removing and re-adding re-triggers
      span.classList.add(ROLL_CLASS);
      timers.set(
        span,
        setTimeout(() => span.classList.remove(ROLL_CLASS), ROLL_MS),
      );
    });
  }

  return {
    /**
     * @param {number} next - byte count
     * @returns {boolean} whether the displayed value actually changed
     */
    setValue(next) {
      const normalized = Math.max(0, Math.trunc(Number(next) || 0));
      if (normalized === value) return false;

      const previous = value;
      value = normalized;
      render(normalized, previous);
      root.setAttribute("aria-label", `${normalized} bytes`);
      if (previous !== null) onDigitChange?.(normalized);
      return true;
    },

    getValue: () => value,

    /** Cancel pending roll timers — used when tearing the page down. */
    destroy() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    },
  };
}
