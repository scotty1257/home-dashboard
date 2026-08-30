import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdMember } from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const boardMock = vi.hoisted(() => vi.fn());
const queueMock = vi.hoisted(() => vi.fn());
const voiceNotesMock = vi.hoisted(() => vi.fn());
const launchCurrentMock = vi.hoisted(() => vi.fn());
const launchTemplatesMock = vi.hoisted(() => vi.fn());
const dutySummaryMock = vi.hoisted(() => vi.fn());
const weatherMock = vi.hoisted(() => vi.fn());
const mediaMock = vi.hoisted(() => vi.fn());
const activityMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock },
    handoffs: { board: boardMock, claim: vi.fn(), resolve: vi.fn(), requestBackup: vi.fn(), create: vi.fn() },
    permissions: { queue: queueMock, decide: vi.fn(), create: vi.fn(), reopen: vi.fn() },
    voiceNotes: { list: voiceNotesMock, upload: vi.fn(), markRead: vi.fn(), remove: vi.fn() },
    launch: {
      current: launchCurrentMock,
      templates: launchTemplatesMock,
      toggleStep: vi.fn(),
      chimePlayed: vi.fn(),
      reset: vi.fn(),
    },
    duties: { summary: dutySummaryMock, logEntry: vi.fn(), undoEntry: vi.fn() },
    weather: weatherMock,
    media: mediaMock,
    mediaCommand: vi.fn(),
    activity: activityMock,
  },
}));

import { TodayOverview } from "./TodayOverview";
import { useActorStore, useNavStore } from "../../lib/store";

const stamp = "2026-01-01T00:00:00.000Z";

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

const WEATHER = {
  location: "Test City",
  units: "imperial" as const,
  current: {
    temperature: 72,
    feelsLike: 70,
    condition: "clear" as const,
    humidity: 40,
    windSpeed: 5,
    windDirection: 180,
    precipitation: 0,
    pressure: 1015,
    isDay: true,
    updatedAt: stamp,
  },
  hourly: [],
  daily: [
    { date: "2026-01-01", high: 72, low: 54, condition: "clear" as const, precipitationProbability: 0 },
  ],
  alerts: [],
  stale: false,
};

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

beforeEach(() => {
  vi.stubGlobal("localStorage", makeLocalStorage());
  useActorStore.setState({ actorId: "member-you" });
  useNavStore.setState({ view: "today" });

  listMock.mockReset().mockResolvedValue({ members: MEMBERS });
  boardMock.mockReset().mockResolvedValue({ items: [], from: stamp, to: stamp });
  queueMock.mockReset().mockResolvedValue({ pending: [], recent: [] });
  voiceNotesMock.mockReset().mockResolvedValue({ notes: [] });
  launchCurrentMock.mockReset().mockResolvedValue({ run: null, template: null, steps: [], nowIso: stamp });
  launchTemplatesMock.mockReset().mockResolvedValue({ templates: [] });
  dutySummaryMock
    .mockReset()
    .mockResolvedValue({ windowStart: stamp, windowEnd: stamp, duties: [], recentEntries: [] });
  weatherMock.mockReset().mockResolvedValue(WEATHER);
  mediaMock.mockReset().mockResolvedValue(null);
  activityMock.mockReset().mockResolvedValue({ items: [], updatedAt: stamp });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodayOverview", () => {
  it("renders all six grid regions with their panel headings", async () => {
    renderWithProviders(<TodayOverview />);

    // Row 1: handoffs, permissions, voice notes.
    expect(await screen.findByRole("heading", { name: /^Handoffs$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Permissions$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Voice notes$/ })).toBeInTheDocument();

    // Row 2: launch, duties, and the context rail (weather + media + activity).
    expect(screen.getByRole("heading", { name: /^Launch$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Duties$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Weather$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Now Playing$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Now & Upcoming" })).toBeInTheDocument();
  });

  it("routes the tiles' open affordances to the Family screen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TodayOverview />);

    // Both the permissions tile and the duties tile expose "View all";
    // clicking either one navigates to the Family screen.
    const viewAll = await screen.findAllByRole("button", { name: /^View all$/ });
    expect(viewAll.length).toBeGreaterThanOrEqual(2);
    await user.click(viewAll[0]!);
    expect(useNavStore.getState().view).toBe("family");
  });
});
