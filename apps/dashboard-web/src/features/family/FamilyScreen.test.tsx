import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { HouseholdMember } from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const boardMock = vi.hoisted(() => vi.fn());
const contactsMock = vi.hoisted(() => vi.fn());
const queueMock = vi.hoisted(() => vi.fn());
const rulesMock = vi.hoisted(() => vi.fn());
const dutySummaryMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock, updateMember: vi.fn() },
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
    duties: { summary: dutySummaryMock, logEntry: vi.fn(), undoEntry: vi.fn() },
  },
}));

import { FamilyScreen } from "./FamilyScreen";
import { useActorStore } from "../../lib/store";

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

  listMock.mockReset().mockResolvedValue({ members: MEMBERS });
  boardMock.mockReset().mockResolvedValue({ items: [], from: stamp, to: stamp });
  contactsMock.mockReset().mockResolvedValue({ contacts: [] });
  queueMock.mockReset().mockResolvedValue({ pending: [], recent: [] });
  rulesMock.mockReset().mockResolvedValue({ rules: [] });
  dutySummaryMock
    .mockReset()
    .mockResolvedValue({ windowStart: stamp, windowEnd: stamp, duties: [], recentEntries: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FamilyScreen", () => {
  it("exposes all three module columns by heading", async () => {
    renderWithProviders(<FamilyScreen />);

    expect(await screen.findByRole("heading", { name: /^Handoffs$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Permissions$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Duties$/ })).toBeInTheDocument();
  });

  it("renders each module's empty state for a fresh household", async () => {
    renderWithProviders(<FamilyScreen />);

    expect(await screen.findByText("No handoffs in the next two weeks.")).toBeInTheDocument();
    expect(screen.getByText("No pending requests.")).toBeInTheDocument();
    expect(screen.getByText("No duties logged yet.")).toBeInTheDocument();
  });
});
