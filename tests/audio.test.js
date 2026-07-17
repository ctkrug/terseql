import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSfx, VOICE_NAMES } from "../src/audio.js";

/**
 * A stand-in for WebAudio that records what got scheduled. It implements only
 * the surface the voices touch, so if a voice reaches for something new this
 * throws and the test tells us.
 */
function fakeContext() {
  const started = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => {
    const self = { connect: vi.fn(() => self), disconnect: vi.fn() };
    return self;
  };
  return {
    currentTime: 0,
    sampleRate: 48000,
    state: "running",
    destination: node(),
    started,
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: "", frequency: param() }),
    createBuffer: (channels, length) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start: vi.fn(() => started.push("noise")),
      stop: vi.fn(),
    }),
    createOscillator: () => ({
      ...node(),
      type: "",
      frequency: param(),
      start: vi.fn(() => started.push("osc")),
      stop: vi.fn(),
    }),
  };
}

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    get: (k) => (k in data ? data[k] : null),
    set: (k, v) => {
      data[k] = v;
    },
    data,
  };
}

let storage;
beforeEach(() => {
  storage = fakeStorage();
});

describe("createSfx — lazy AudioContext", () => {
  it("does not construct a context on creation", () => {
    const contextFactory = vi.fn(fakeContext);
    createSfx({ contextFactory, storage });
    expect(contextFactory).not.toHaveBeenCalled();
  });

  it("constructs the context on the first play and reuses it after", () => {
    const contextFactory = vi.fn(fakeContext);
    const sfx = createSfx({ contextFactory, storage });

    expect(sfx.isReady()).toBe(false);
    sfx.play("run");
    expect(contextFactory).toHaveBeenCalledTimes(1);
    expect(sfx.isReady()).toBe(true);

    sfx.play("pass");
    expect(contextFactory).toHaveBeenCalledTimes(1);
  });

  it("resumes a context the browser started suspended", () => {
    const ctx = fakeContext();
    ctx.state = "suspended";
    const sfx = createSfx({ contextFactory: () => ctx, storage });
    sfx.play("run");
    expect(ctx.resume).toHaveBeenCalled();
  });
});

describe("createSfx — voices", () => {
  it.each(VOICE_NAMES)("schedules audio nodes for the %s voice", (name) => {
    const ctx = fakeContext();
    const sfx = createSfx({ contextFactory: () => ctx, storage });
    expect(sfx.play(name)).toBe(true);
    expect(ctx.started.length).toBeGreaterThan(0);
  });

  it("covers every voice named in the design's juice plan", () => {
    expect(VOICE_NAMES).toEqual(
      expect.arrayContaining(["keystroke", "run", "fail", "pass", "win"]),
    );
  });

  it("ignores an unknown voice instead of throwing", () => {
    const sfx = createSfx({ contextFactory: fakeContext, storage });
    expect(sfx.play("nope")).toBe(false);
  });

  it("throttles the keystroke tick so a held key can't machine-gun", () => {
    const ctx = fakeContext();
    const sfx = createSfx({ contextFactory: () => ctx, storage });
    expect(sfx.play("keystroke")).toBe(true);
    expect(sfx.play("keystroke")).toBe(false);

    ctx.currentTime = 1;
    expect(sfx.play("keystroke")).toBe(true);
  });

  it("throttles the tick against other keystrokes only, not every voice", () => {
    const ctx = fakeContext();
    const sfx = createSfx({ contextFactory: () => ctx, storage });
    // A Run fires the instant before the player types the next character.
    expect(sfx.play("run")).toBe(true);
    expect(sfx.play("keystroke")).toBe(true);
  });
});

describe("createSfx — mute", () => {
  it("plays nothing while muted", () => {
    const sfx = createSfx({ contextFactory: fakeContext, storage });
    sfx.setMuted(true);
    expect(sfx.play("win")).toBe(false);
  });

  it("does not even build a context while muted", () => {
    const contextFactory = vi.fn(fakeContext);
    const sfx = createSfx({ contextFactory, storage });
    sfx.setMuted(true);
    sfx.play("win");
    expect(contextFactory).not.toHaveBeenCalled();
  });

  it("toggles and reports state", () => {
    const sfx = createSfx({ contextFactory: fakeContext, storage });
    expect(sfx.isMuted()).toBe(false);
    expect(sfx.toggleMute()).toBe(true);
    expect(sfx.isMuted()).toBe(true);
    expect(sfx.toggleMute()).toBe(false);
  });

  it("persists mute so it survives a reload", () => {
    const sfx = createSfx({ contextFactory: fakeContext, storage });
    sfx.setMuted(true);

    const reloaded = createSfx({ contextFactory: fakeContext, storage });
    expect(reloaded.isMuted()).toBe(true);
  });

  it("defaults to unmuted for a first-time player", () => {
    expect(createSfx({ contextFactory: fakeContext, storage }).isMuted()).toBe(false);
  });

  it("resumes playing after unmuting", () => {
    const sfx = createSfx({ contextFactory: fakeContext, storage });
    sfx.setMuted(true);
    sfx.setMuted(false);
    expect(sfx.play("win")).toBe(true);
  });

  it("keeps working when toggleMute is destructured off its object", () => {
    // createSfx() is built to be injected — app.js passes the whole object
    // around, and tests destructure it (see silentSfx() in app.test.js).
    // A method that reaches for `this` breaks the moment it's pulled free.
    const sfx = createSfx({ contextFactory: fakeContext, storage });
    const { toggleMute } = sfx;

    expect(() => toggleMute()).not.toThrow();
    expect(sfx.isMuted()).toBe(true);
  });
});

describe("createSfx — degradation", () => {
  it("stays silent where WebAudio does not exist", () => {
    const sfx = createSfx({ contextFactory: () => null, storage });
    expect(sfx.play("win")).toBe(false);
    expect(sfx.isReady()).toBe(false);
  });

  it("survives a context constructor that throws", () => {
    const sfx = createSfx({
      contextFactory: () => {
        throw new Error("no audio device");
      },
      storage,
    });
    expect(sfx.play("win")).toBe(false);
  });

  it("survives a voice that throws mid-schedule", () => {
    const broken = () => ({
      ...fakeContext(),
      createOscillator: () => {
        throw new Error("node limit reached");
      },
    });
    const sfx = createSfx({ contextFactory: broken, storage });
    expect(sfx.play("run")).toBe(false);
  });

  it("still mutes for the session when storage refuses the write", () => {
    const hostile = {
      get: () => null,
      set: () => {
        throw new Error("quota exceeded");
      },
    };
    const sfx = createSfx({ contextFactory: fakeContext, storage: hostile });

    expect(() => sfx.setMuted(true)).not.toThrow();
    expect(sfx.isMuted()).toBe(true);
    expect(sfx.play("win")).toBe(false);
  });

  it("treats unreadable storage as unmuted rather than failing to construct", () => {
    const hostile = {
      get: () => {
        throw new Error("storage disabled");
      },
      set: () => {},
    };
    expect(() => createSfx({ contextFactory: fakeContext, storage: hostile })).not.toThrow();
  });
});
