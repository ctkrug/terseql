const PARTICLE_COUNT = 18;
const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input, select, textarea, [tabindex]";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function prefersReducedMotionByDefault() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * How this solve compares to the player's previous best on the same puzzle.
 * Pure so the wording is testable without a DOM.
 *
 * @param {number} bytes
 * @param {number|null|undefined} previousBest
 * @returns {{kind: "first"|"improved"|"tied"|"worse", delta: number, text: string}}
 */
export function describeDelta(bytes, previousBest) {
  if (previousBest === null || previousBest === undefined) {
    return { kind: "first", delta: 0, text: "First solve" };
  }
  const delta = previousBest - bytes;
  if (delta > 0) {
    return { kind: "improved", delta, text: `${delta} byte${delta === 1 ? "" : "s"} shorter` };
  }
  if (delta === 0) return { kind: "tied", delta: 0, text: "Matched your best" };
  return { kind: "worse", delta, text: `${-delta} over your best of ${previousBest}` };
}

/**
 * The headline for each kind of solve. Derived from the same delta as the
 * subtitle so the two can't contradict each other — a tie headlined
 * "Shorter" above "Matched your best" reads as a bug, because it is one.
 */
const TITLES = {
  first: "Solved",
  improved: "Shorter",
  tied: "Matched",
  worse: "Still solved",
};

/**
 * The win moment.
 *
 * Dismissing it is explicitly not "undoing" the solve — the puzzle stays
 * solved and the player drops straight back to the editor to golf it further,
 * which is the actual game. So this owns no solve state; it just reports that
 * it closed.
 *
 * @param {HTMLElement} root
 * @param {Object} [options]
 * @param {() => (Promise<boolean>|boolean)} [options.onCopyShare] - returns whether the copy worked
 * @param {() => void} [options.onClose]
 * @param {() => boolean} [options.prefersReducedMotion]
 */
export function createWinOverlay(root, options = {}) {
  if (!root) throw new Error("createWinOverlay needs a root element");
  const { onCopyShare, onClose, prefersReducedMotion = prefersReducedMotionByDefault } = options;

  let open = false;
  let lastFocused = null;
  let copyResetTimer = null;

  function close() {
    if (!open) return;
    open = false;
    root.hidden = true;
    root.textContent = "";
    clearTimeout(copyResetTimer);
    // Send focus back where it came from — a keyboard player should land in
    // the editor, not at the top of the document.
    if (lastFocused?.isConnected) lastFocused.focus();
    onClose?.();
  }

  // aria-modal="true" is a promise to assistive tech that Tab can't leave
  // the dialog. No native <dialog>/showModal() here (unsupported in this
  // project's jsdom test environment), so the trap is hand-rolled: wrap at
  // the boundaries, and pull focus back in if it ever lands outside by some
  // other path (e.g. a programmatic .focus() elsewhere on the page).
  function trapFocus(event) {
    const focusable = [...root.querySelectorAll(FOCUSABLE_SELECTOR)];
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inside = root.contains(active);

    if (event.shiftKey ? inside && active !== first : inside && active !== last) return;

    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") trapFocus(event);
  }

  root.addEventListener("keydown", onKeydown);

  return {
    isOpen: () => open,

    /**
     * @param {Object} params
     * @param {number} params.bytes
     * @param {number} [params.previousBest]
     * @param {number} [params.streak]
     * @param {string} [params.title] - overrides the delta-derived headline
     */
    show({ bytes, previousBest, streak = 0, title }) {
      lastFocused = document.activeElement;
      open = true;
      root.hidden = false;
      root.textContent = "";

      const card = el("div", "win-card");
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-labelledby", "win-title");

      const delta = describeDelta(bytes, previousBest);

      const heading = el("h2", "win-title display", title ?? TITLES[delta.kind]);
      heading.id = "win-title";

      const score = el("p", "win-score");
      score.append(el("span", "win-bytes", String(bytes)), el("span", "win-unit", "bytes"));

      const deltaEl = el("p", `win-delta win-delta-${delta.kind}`, delta.text);

      card.append(heading, score, deltaEl);

      if (streak >= 2) card.append(el("p", "win-streak", `🔥 ${streak}-day streak`));

      const actions = el("div", "win-actions");
      const copyButton = el("button", "button-primary", "Copy share card");
      copyButton.type = "button";
      copyButton.addEventListener("click", async () => {
        const ok = await onCopyShare?.();
        copyButton.textContent = ok === true ? "Copied!" : "Copy failed";
        clearTimeout(copyResetTimer);
        copyResetTimer = setTimeout(() => {
          copyButton.textContent = "Copy share card";
        }, 1600);
      });

      const closeButton = el("button", "button-ghost", "Keep golfing");
      closeButton.type = "button";
      closeButton.addEventListener("click", close);

      actions.append(copyButton, closeButton);
      card.append(actions);

      const dismiss = el("button", "win-close");
      dismiss.type = "button";
      dismiss.setAttribute("aria-label", "Close");
      dismiss.textContent = "✕";
      dismiss.addEventListener("click", close);
      card.append(dismiss);

      if (!prefersReducedMotion()) {
        const particles = el("div", "win-particles");
        particles.setAttribute("aria-hidden", "true");
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const mote = el("i", "mote");
          // Deterministic-ish spread; the exact angles don't matter, only that
          // they differ. Cyan and amber alternate, per the design tokens.
          mote.style.setProperty("--angle", `${(360 / PARTICLE_COUNT) * i}deg`);
          mote.style.setProperty("--delay", `${(i % 5) * 20}ms`);
          mote.dataset.tone = i % 3 === 0 ? "amber" : "cyan";
          particles.append(mote);
        }
        card.append(particles);
      }

      root.append(card);
      closeButton.focus();
    },

    close,

    destroy() {
      root.removeEventListener("keydown", onKeydown);
      clearTimeout(copyResetTimer);
    },
  };
}
