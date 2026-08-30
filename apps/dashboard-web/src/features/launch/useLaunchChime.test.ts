import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { LaunchRun, LaunchTemplate } from "@home-dashboard/contracts";
import { useLaunchChime } from "./useLaunchChime";

const MINUTE = 60_000;
const stamp = "2026-08-29T12:00:00.000Z";

function makeRun(overrides: Partial<LaunchRun> = {}): LaunchRun {
  return {
    id: "run-1",
    templateId: "tpl-1",
    serviceDate: "2026-08-29",
    departureAt: new Date(Date.now() + 6 * MINUTE).toISOString(),
    status: "active",
    completedStepIds: [],
    chimePlayedAt: undefined,
    completedAt: undefined,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<LaunchTemplate> = {}): LaunchTemplate {
  return {
    id: "tpl-1",
    childId: "member-kid",
    name: "School morning",
    weekdays: [1, 2, 3, 4, 5],
    departureLocalTime: "08:00",
    activeWindowMinutes: 45,
    chimeBeforeMinutes: 3,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

/** Minimal Web Audio parameter (frequency / gain automation is record-only). */
function makeParam() {
  return {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

interface FakeOscillator {
  type: string;
  frequency: ReturnType<typeof makeParam>;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

/**
 * Fake AudioContext standing in for jsdom's missing one. Instances are
 * recorded on the class so tests can count construction (chime attempts);
 * oscillators are recorded so tests can assert the two tones.
 */
class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];

  static last(): FakeAudioContext {
    const instance = FakeAudioContext.instances.at(-1);
    if (!instance) throw new Error("no FakeAudioContext was constructed");
    return instance;
  }

  state: "suspended" | "running";
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  resume: ReturnType<typeof vi.fn>;
  close = vi.fn(() => Promise.resolve());

  constructor(options: { state?: "suspended" | "running"; resume?: (ctx: FakeAudioContext) => Promise<void> } = {}) {
    this.state = options.state ?? "running";
    this.resume = vi.fn(() =>
      options.resume
        ? options.resume(this)
        : Promise.resolve().then(() => {
            this.state = "running";
          }),
    );
    FakeAudioContext.instances.push(this);
  }

  createOscillator(): FakeOscillator {
    const osc: FakeOscillator = {
      type: "sine",
      frequency: makeParam(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  }

  createGain() {
    return { gain: makeParam(), connect: vi.fn() };
  }
}

/**
 * Installs a fake AudioContext class and resets the instance log. The hook
 * constructs with `new AudioContext()` (no args), so the per-test config is
 * closed over by the subclass constructor rather than passed per instance.
 */
function installAudioContext(
  options: { state?: "suspended" | "running"; resume?: (ctx: FakeAudioContext) => Promise<void> } = {},
): typeof FakeAudioContext {
  FakeAudioContext.instances.length = 0;
  const Ctor = class extends FakeAudioContext {
    constructor() {
      super(options);
    }
  };
  vi.stubGlobal("AudioContext", Ctor);
  return Ctor;
}

describe("useLaunchChime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("crossing the threshold attempts the chime once, acks after running, and never re-attempts", async () => {
    const run = makeRun({ departureAt: new Date(Date.now() + 6 * MINUTE).toISOString() });
    const template = makeTemplate({ chimeBeforeMinutes: 3 });
    const ack = vi.fn().mockResolvedValue(undefined);
    const Ctor = installAudioContext({ state: "running" });

    const { result } = renderHook(() => useLaunchChime({ run, template, ack }));
    expect(result.current.chimeState).toBe("armed");

    // Before the lead-up window (departure - 3min): armed, but no attempt.
    act(() => {
      vi.advanceTimersByTime(2 * MINUTE);
    });
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(ack).not.toHaveBeenCalled();

    // Cross the threshold: attempt fires on the 1s tick that enters the window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MINUTE + 1000);
    });
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(result.current.chimeState).toBe("played");
    expect(ack).toHaveBeenCalledTimes(1);

    // Two-tone chime scheduled: ~880Hz first, then ~1320Hz.
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));
    expect(ctx.oscillators[1]!.frequency.setValueAtTime).toHaveBeenCalledWith(1320, expect.any(Number));

    // Later ticks never re-attempt (played + chimePlayedAt persisted by ack).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * MINUTE);
    });
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(result.current.chimeState).toBe("played");
  });

  it("a context that cannot resume goes 'blocked' and never acks", async () => {
    const run = makeRun({ departureAt: new Date(Date.now() + 2 * MINUTE).toISOString() });
    const template = makeTemplate({ chimeBeforeMinutes: 3 });
    const ack = vi.fn().mockResolvedValue(undefined);
    installAudioContext({
      state: "suspended",
      resume: () => Promise.reject(new Error("autoplay blocked")),
    });

    const { result } = renderHook(() => useLaunchChime({ run, template, ack }));

    // The threshold is already passed at mount, so the mount check attempts
    // immediately; resume() rejects → blocked, and the ack must NEVER fire.
    await act(async () => {});
    expect(result.current.chimeState).toBe("blocked");
    expect(ack).not.toHaveBeenCalled();

    // Further ticks keep it blocked without attempting or acking.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * MINUTE);
    });
    expect(result.current.chimeState).toBe("blocked");
    expect(ack).not.toHaveBeenCalled();
  });

  it("a run whose chime was already played never attempts", async () => {
    const run = makeRun({
      departureAt: new Date(Date.now() + 2 * MINUTE).toISOString(),
      chimePlayedAt: new Date(Date.now() - MINUTE).toISOString(),
    });
    const template = makeTemplate({ chimeBeforeMinutes: 3 });
    const ack = vi.fn().mockResolvedValue(undefined);
    installAudioContext({ state: "running" });

    const { result } = renderHook(() => useLaunchChime({ run, template, ack }));
    expect(result.current.chimeState).toBe("idle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
    });
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(ack).not.toHaveBeenCalled();
    expect(result.current.chimeState).toBe("idle");
  });
});
