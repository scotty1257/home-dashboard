import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdMember } from "@home-dashboard/contracts";
import { renderWithProviders } from "./test/renderWithProviders";

const healthMock = vi.hoisted(() => vi.fn());
const mediaStatusMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const calendarMock = vi.hoisted(() => vi.fn());
const boardMock = vi.hoisted(() => vi.fn());
const contactsMock = vi.hoisted(() => vi.fn());
const queueMock = vi.hoisted(() => vi.fn());
const rulesMock = vi.hoisted(() => vi.fn());
const voiceNotesMock = vi.hoisted(() => vi.fn());
const launchCurrentMock = vi.hoisted(() => vi.fn());
const launchTemplatesMock = vi.hoisted(() => vi.fn());
const dutySummaryMock = vi.hoisted(() => vi.fn());
const weatherMock = vi.hoisted(() => vi.fn());
const homeMock = vi.hoisted(() => vi.fn());
const mediaMock = vi.hoisted(() => vi.fn());
const activityMock = vi.hoisted(() => vi.fn());
const settingsMock = vi.hoisted(() => vi.fn());

vi.mock("./lib/events", () => ({
  // jsdom has no EventSource; the live-events subscription is not under test.
  subscribeEvents: () => () => {},
}));

vi.mock("./lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    health: healthMock,
    mediaStatus: mediaStatusMock,
    household: { list: listMock, updateMember: vi.fn() },
    calendar: { list: calendarMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    weather: weatherMock,
    home: homeMock,
    homeCommand: vi.fn(),
    patchEntity: vi.fn(),
    media: mediaMock,
    mediaCommand: vi.fn(),
    mediaSearch: vi.fn(),
    handoffs: {
      board: boardMock,
      claim: vi.fn(),
      resolve: vi.fn(),
      requestBackup: vi.fn(),
      create: vi.fn(),
    },
    backupContacts: { list: contactsMock, create: vi.fn(), update: vi.fn() },
    permissions: { queue: queueMock, decide: vi.fn(), create: vi.fn(), reopen: vi.fn() },
    permissionRules: { list: rulesMock, create: vi.fn(), update: vi.fn() },
    voiceNotes: { list: voiceNotesMock, upload: vi.fn(), markRead: vi.fn(), remove: vi.fn() },
    launch: {
      current: launchCurrentMock,
      templates: launchTemplatesMock,
      toggleStep: vi.fn(),
      chimePlayed: vi.fn(),
      reset: vi.fn(),
    },
    duties: { summary: dutySummaryMock, logEntry: vi.fn(), undoEntry: vi.fn() },
    activity: activityMock,
    settings: settingsMock,
    updateSettings: vi.fn(),
    voiceSession: vi.fn(),
  },
}));

import App from "./App";
import { useActorStore, useNavStore } from "./lib/store";

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
  daily: [{ date: "2026-01-01", high: 72, low: 54, condition: "clear" as const, precipitationProbability: 0 }],
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

  healthMock.mockReset().mockResolvedValue({ services: [] });
  mediaStatusMock.mockReset().mockResolvedValue({ configured: false, authorized: false, authorizeUrl: null });
  listMock.mockReset().mockResolvedValue({ members: MEMBERS });
  calendarMock.mockReset().mockResolvedValue({ events: [] });
  boardMock.mockReset().mockResolvedValue({ items: [], from: stamp, to: stamp });
  contactsMock.mockReset().mockResolvedValue({ contacts: [] });
  queueMock.mockReset().mockResolvedValue({ pending: [], recent: [] });
  rulesMock.mockReset().mockResolvedValue({ rules: [] });
  voiceNotesMock.mockReset().mockResolvedValue({ notes: [] });
  launchCurrentMock.mockReset().mockResolvedValue({ run: null, template: null, steps: [], nowIso: stamp });
  launchTemplatesMock.mockReset().mockResolvedValue({ templates: [] });
  dutySummaryMock
    .mockReset()
    .mockResolvedValue({ windowStart: stamp, windowEnd: stamp, duties: [], recentEntries: [] });
  weatherMock.mockReset().mockResolvedValue(WEATHER);
  homeMock.mockReset().mockResolvedValue({ entities: [], scenes: [], connected: false });
  mediaMock.mockReset().mockResolvedValue(null);
  activityMock.mockReset().mockResolvedValue({ items: [], updatedAt: stamp });
  settingsMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App view switching", () => {
  it("renders the Today overview as the default view", async () => {
    renderWithProviders(<App />);

    // Today-only regions: the voice note drop and the context rail.
    expect(await screen.findByRole("heading", { name: /^Voice notes$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Now & Upcoming" })).toBeInTheDocument();
  });

  it("switches to the Family screen from the Family tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByRole("button", { name: /^Family$/ }));

    expect(await screen.findByText("No handoffs in the next two weeks.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Permissions$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Duties$/ })).toBeInTheDocument();
  });

  it("renders the launch sequence inside the Family tab, not as its own tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    // Launch no longer owns a tab.
    expect(screen.queryByRole("button", { name: /^Launch$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Family$/ }));

    // No active run on a fresh database → the quiet state, beside the board.
    expect(await screen.findByText("No launch right now")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Handoffs$/ })).toBeInTheDocument();
  });
});
