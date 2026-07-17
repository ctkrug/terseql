const MUTE_KEY = "terseql:muted";
const KEYSTROKE_THROTTLE_S = 0.03;

/**
 * Every voice is synthesized from oscillators and noise at call time — the
 * repo carries zero audio files. Volumes are deliberately low: this is a
 * thinking game, and the SFX are punctuation, not a soundtrack.
 *
 * Each entry receives the AudioContext and a destination gain node, and is
 * responsible for scheduling and stopping its own nodes.
 */
const VOICES = {
  // Near-silent tick on a byte-count change — filtered noise, 20ms.
  keystroke(ctx, out) {
    const length = Math.floor(ctx.sampleRate * 0.02);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Decaying white noise; the ramp keeps it a tick, not a hiss.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    source.connect(filter).connect(gain).connect(out);
    source.start();
    source.stop(ctx.currentTime + 0.02);
  },

  // Run pressed — short rising sine blip, 80ms.
  run(ctx, out) {
    tone(ctx, out, { type: "sine", from: 440, to: 660, duration: 0.08, peak: 0.12 });
  },

  // Wrong answer — low detuned square buzz, 150ms.
  fail(ctx, out) {
    tone(ctx, out, { type: "square", from: 150, to: 110, duration: 0.15, peak: 0.07 });
    tone(ctx, out, { type: "square", from: 147, to: 108, duration: 0.15, peak: 0.07 });
  },

  // Right answer — two-note ascending chime.
  pass(ctx, out) {
    tone(ctx, out, { type: "sine", from: 660, to: 660, duration: 0.11, peak: 0.1 });
    tone(ctx, out, { type: "sine", from: 880, to: 880, duration: 0.14, peak: 0.1, delay: 0.11 });
  },

  // Submitted a passing query — three-note major arpeggio.
  win(ctx, out) {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      tone(ctx, out, {
        type: "sine",
        from: freq,
        to: freq,
        duration: 0.18,
        peak: 0.12,
        delay: i * 0.11,
      });
    });
  },
};

/** Schedule one enveloped oscillator note. */
function tone(ctx, out, { type, from, to, duration, peak, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.linearRampToValueAtTime(to, start + duration);

  // Tiny attack then exponential decay — a raw gate would click.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function defaultContextFactory() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

const defaultStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode / storage disabled — mute just won't survive a reload.
    }
  },
};

/**
 * Build a sound player.
 *
 * The AudioContext is created on the first `play()` and never before: browsers
 * refuse (or warn about) contexts constructed outside a user gesture, and
 * environments without WebAudio — tests, older browsers — must degrade to
 * silence rather than throw. Every failure path here no-ops.
 *
 * @param {Object} [deps]
 * @param {() => (AudioContext|null)} [deps.contextFactory]
 * @param {{get: (k: string) => (string|null), set: (k: string, v: string) => void}} [deps.storage]
 */
export function createSfx({
  contextFactory = defaultContextFactory,
  storage = defaultStorage,
} = {}) {
  let ctx = null;
  let master = null;
  let muted = readMuted();
  // -Infinity, not 0: a fresh AudioContext starts at currentTime 0, so a zero
  // here would throttle away the very first tick.
  let lastKeystrokeAt = -Infinity;

  function readMuted() {
    try {
      return storage.get(MUTE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function ensureContext() {
    if (ctx) return ctx;
    try {
      ctx = contextFactory();
    } catch {
      ctx = null;
    }
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    return ctx;
  }

  return {
    isMuted: () => muted,

    setMuted(next) {
      muted = Boolean(next);
      // Failing to persist must not fail the toggle: the player asked for
      // silence now, and they get it even if it won't survive a reload.
      try {
        storage.set(MUTE_KEY, String(muted));
      } catch {
        /* storage unavailable */
      }
      return muted;
    },

    toggleMute() {
      return this.setMuted(!muted);
    },

    /** True once a context exists — i.e. after the first successful play. */
    isReady: () => Boolean(ctx),

    /**
     * Play a named voice. Returns whether it actually sounded, so callers can
     * tell "muted/unsupported" from "played" without inspecting internals.
     * @param {keyof VOICES} name
     * @returns {boolean}
     */
    play(name) {
      const voice = VOICES[name];
      if (!voice || muted) return false;

      const audio = ensureContext();
      if (!audio) return false;

      // A held-down key shouldn't machine-gun the tick. The window is the
      // keystroke's own: clocking it on every voice let a Run or a win
      // swallow the next tick the player typed.
      if (name === "keystroke") {
        const now = audio.currentTime;
        if (now - lastKeystrokeAt < KEYSTROKE_THROTTLE_S) return false;
        lastKeystrokeAt = now;
      }

      // Chrome starts contexts suspended until a gesture resolves.
      if (audio.state === "suspended" && typeof audio.resume === "function") {
        audio.resume().catch(() => {});
      }

      try {
        voice(audio, master);
        return true;
      } catch {
        // A broken voice must never take the page down mid-solve.
        return false;
      }
    },
  };
}

/** The page's shared player. */
export const sfx = createSfx();

/** Names of every available voice — exported so tests can drive each one. */
export const VOICE_NAMES = Object.keys(VOICES);
