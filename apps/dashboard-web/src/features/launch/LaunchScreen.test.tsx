import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  HouseholdMember,
  LaunchCurrentResponse,
  LaunchRun,
  LaunchStep,
  LaunchTemplate,
} from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const currentMock = vi.hoisted(() => vi.fn());
const toggleMock = vi.hoisted(() => vi.fn());
const chimePlayedMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());
const templatesMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock },
    launch: {
      current: currentMock,
      toggleStep: toggleMock,
      chimePlayed: chimePlayedMock,
      reset: resetMock,
      templates: templatesMock,
    },
  },
}));

import { LaunchScreen } from "./LaunchScreen";
import { useActorStore } from "../../lib/store";

const MINUTE = 60_000;
const stamp = "2026-08-29T12:00:00.000Z";

const MEMBERS: HouseholdMember[] = [
  {
    id: "member-you",
    displayName: "You",
    role: "adult",
    color: "coral",
    icon: "user",
    sortOrder: 0,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "member-kid",
    displayName: "Kid",
    role: "child",
    color: "teal",
    icon: "baby",
    sortOrder: 2,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
];

const TEMPLATE: LaunchTemplate = {
  id: "tpl-1",
  childId: "member-kid",
  name: "School morning",
  weekdays: [1, 2, 3, 4, 5],
  departureLocalTime: "12:10",
  activeWindowMinutes: 45,
  chimeBeforeMinutes: 3,
  active: true,
  createdAt: stamp,
  updatedAt: stamp,
};

const STEPS: LaunchStep[] = [
  { id: "step-shoes", templateId: "tpl-1", label: "Shoes", icon: "shoes", sortOrder: 0, active: true },
  { id: "step-bag", templateId: "tpl-1", label: "Backpack", icon: "bag", sortOrder: 1, active: true },
];

function makeRun(overrides: Partial<LaunchRun> = {}): LaunchRun {
  return {
    id: "run-1",
    templateId: "tpl-1",
    serviceDate: "2026-08-29",
    departureAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
    status: "active",
    completedStepIds: [],
    chimePlayedAt: undefined,
    completedAt: undefined,
    ...overrides,
  };
}

function makeCurrent(
  overrides: { run?: LaunchRun; template?: LaunchTemplate | null; steps?: LaunchStep[] } = {},
): LaunchCurrentResponse {
  return {
    run: overrides.run ?? makeRun(),
    template: overrides.template ?? TEMPLATE,
    steps: overrides.steps ?? STEPS,
    nowIso: new Date().toISOString(),
  };
}

/** Minimal Web Audio parameter (record-only automation). */
function makeParam() {
  return {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

/**
 * Fake AudioContext standing in for jsdom's missing one. The screen constructs
 * `new AudioContext()` with no arguments, so the per-test config is closed
 * over by the installed subclass.
 */
class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];

  state: "suspended" | "running";
  currentTime = 0;
  destination = {};
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

  createOscillator() {
    return { type: "sine", frequency: makeParam(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }

  createGain() {
    return { gain: makeParam(), connect: vi.fn() };
  }
}

/** In-memory Storage stand-in (jsdom here has an opaque origin). */
function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => store.set(key, String(value)),
  };
}

const user = userEvent.setup();

beforeEach(() => {
  vi.stubGlobal("localStorage", makeLocalStorage());
  useActorStore.setState({ actorId: "member-you" });
  listMock.mockReset().mockResolvedValue({ members: MEMBERS });
  currentMock.mockReset().mockResolvedValue(makeCurrent());
  toggleMock.mockReset().mockResolvedValue({ run: makeRun() });
  chimePlayedMock.mockReset().mockResolvedValue({ run: makeRun() });
  resetMock.mockReset().mockResolvedValue({ run: makeRun() });
  templatesMock.mockReset().mockResolvedValue({ templates: [] });
  FakeAudioContext.instances.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LaunchScreen", () => {
  it("renders 'Bus in 6 min' when the departure is six minutes out", async () => {
    currentMock.mockResolvedValue(
      makeCurrent({ run: makeRun({ departureAt: new Date(Date.now() + 6 * MINUTE).toISOString() }) }),
    );

    renderWithProviders(<LaunchScreen />);

    expect(await screen.findByText("Bus in 6 min")).toBeInTheDocument();
  });

  it("taps a step card to complete it (grey + check), and taps again to undo", async () => {
    const departureAt = new Date(Date.now() + 10 * MINUTE).toISOString();
    const todo = makeCurrent({ run: makeRun({ departureAt }) });
    const oneDone = makeCurrent({ run: makeRun({ departureAt, completedStepIds: ["step-shoes"] }) });
    currentMock.mockResolvedValueOnce(todo).mockResolvedValueOnce(oneDone).mockResolvedValue(oneDone);
    toggleMock.mockResolvedValue({ run: oneDone.run });

    renderWithProviders(<LaunchScreen />);

    const shoes = await screen.findByRole("button", { name: "Shoes" });
    await user.click(shoes);

    expect(toggleMock).toHaveBeenCalledTimes(1);
    expect(toggleMock).toHaveBeenCalledWith("run-1", "step-shoes", "member-you");

    // Refetch says Shoes is done: greyed out with a check badge, still a button.
    const greyed = await screen.findByRole("button", { name: "Shoes" });
    expect(greyed.className).toContain("opacity-35");
    expect(greyed.className).toContain("grayscale");
    expect(greyed.querySelector("[data-check]")).not.toBeNull();

    // Still tappable: the undo toggle fires with the same ids.
    await user.click(greyed);
    expect(toggleMock).toHaveBeenCalledTimes(2);
    expect(toggleMock).toHaveBeenNthCalledWith(2, "run-1", "step-shoes", "member-you");
  });

  it("shows 'Complete' when every step is done", async () => {
    currentMock.mockResolvedValue(
      makeCurrent({
        run: makeRun({
          completedStepIds: ["step-shoes", "step-bag"],
          status: "complete",
          completedAt: new Date().toISOString(),
        }),
      }),
    );

    renderWithProviders(<LaunchScreen />);

    expect(await screen.findByText("Complete")).toBeInTheDocument();
  });

  it("shows 'Tap to enable chime' when autoplay is blocked; tapping enables and acks once", async () => {
    // Inside the 3-minute chime lead-up, so the chime is due on entry.
    const departureAt = new Date(Date.now() + 2 * MINUTE).toISOString();
    currentMock.mockResolvedValue(makeCurrent({ run: makeRun({ departureAt }) }));
    chimePlayedMock.mockResolvedValue({ run: makeRun({ departureAt }) });

    let resumeAttempts = 0;
    const Ctor = class extends FakeAudioContext {
      constructor() {
        super({
          state: "suspended",
          resume: (ctx) => {
            resumeAttempts += 1;
            if (resumeAttempts === 1) return Promise.reject(new Error("autoplay blocked"));
            ctx.state = "running";
            return Promise.resolve();
          },
        });
      }
    };
    vi.stubGlobal("AudioContext", Ctor);

    renderWithProviders(<LaunchScreen />);

    // The automatic attempt is blocked → the enable affordance appears.
    const enable = await screen.findByRole("button", { name: "Tap to enable chime" });
    expect(chimePlayedMock).not.toHaveBeenCalled();

    // Tapping resumes the context on the gesture, plays, and acks once.
    await user.click(enable);
    await waitFor(() => expect(chimePlayedMock).toHaveBeenCalledTimes(1));
    expect(chimePlayedMock).toHaveBeenCalledWith("run-1", "member-you");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Tap to enable chime" })).not.toBeInTheDocument(),
    );
  });
});
