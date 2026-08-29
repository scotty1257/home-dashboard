import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DutySummary, HouseholdMember } from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const summaryMock = vi.hoisted(() => vi.fn());
const logMock = vi.hoisted(() => vi.fn());
const undoMock = vi.hoisted(() => vi.fn());
const createDefinitionMock = vi.hoisted(() => vi.fn());
const updateDefinitionMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock },
    duties: {
      summary: summaryMock,
      logEntry: logMock,
      undoEntry: undoMock,
      createDefinition: createDefinitionMock,
      updateDefinition: updateDefinitionMock,
    },
  },
}));

import { DutyLedger } from "./DutyLedger";
import { DutyLedgerTile } from "./DutyLedgerTile";
import { useActorStore } from "../../lib/store";

const stamp = "2026-01-01T00:00:00.000Z";

/** Local-zone instant so the formatted time in the history list is deterministic. */
const AT_4_15_PM = new Date(2026, 0, 1, 16, 15).toISOString(); // → "4:15 PM"

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
    id: "member-partner",
    displayName: "Partner",
    role: "adult",
    color: "indigo",
    icon: "user-round",
    sortOrder: 1,
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

const SUMMARY: DutySummary = {
  windowStart: stamp,
  windowEnd: stamp,
  duties: [
    {
      dutyId: "duty-bedtime",
      name: "Bedtime",
      icon: "bedtime",
      color: "violet",
      counts: [
        { memberId: "member-you", displayName: "You", count: 3 },
        { memberId: "member-partner", displayName: "Partner", count: 5 },
      ],
      mostRecentMemberId: "member-partner",
      mostRecentAt: stamp,
      streak: { memberId: "member-partner", displayName: "Partner", count: 4 },
    },
    {
      dutyId: "duty-school-run",
      name: "School run",
      icon: "school-run",
      color: "sky",
      counts: [{ memberId: "member-you", displayName: "You", count: 2 }],
      mostRecentMemberId: "member-you",
      mostRecentAt: stamp,
      streak: { memberId: "member-you", displayName: "You", count: 2 },
    },
  ],
  recentEntries: [
    {
      id: "entry-9",
      dutyId: "duty-school-run",
      performedBy: "member-partner",
      occurredAt: AT_4_15_PM,
      createdAt: stamp,
      dutyName: "School run",
      performerName: "Partner",
    },
  ],
};

/** The entry the mocked logEntry "creates" for a Bedtime tap. */
const LOGGED = {
  id: "entry-1",
  dutyId: "duty-bedtime",
  performedBy: "member-you",
  occurredAt: stamp,
  createdAt: stamp,
  dutyName: "Bedtime",
  performerName: "You",
};

const user = userEvent.setup();

/** In-memory Storage stand-in (jsdom here has an opaque origin, so window.localStorage is undefined). */
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
  // The first render resolves members lazily; useActiveActor then reads
  // localStorage before the query lands, so it must exist.
  vi.stubGlobal("localStorage", makeLocalStorage());
  // Resolve the active actor straight from the store so tests never rely on it.
  useActorStore.setState({ actorId: "member-you" });
  listMock.mockReset().mockResolvedValue({ members: MEMBERS });
  summaryMock.mockReset().mockResolvedValue(SUMMARY);
  logMock.mockReset().mockResolvedValue(LOGGED);
  undoMock.mockReset().mockResolvedValue({ entry: LOGGED });
  createDefinitionMock.mockReset().mockResolvedValue({});
  updateDefinitionMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DutyLedger", () => {
  it("8. renders per-adult counts, streak text at 4 but not at 2, and the history line", async () => {
    renderWithProviders(<DutyLedger />);

    expect(await screen.findByText("You 3 · Partner 5")).toBeInTheDocument();
    // Streak text appears when the count is 4…
    expect(screen.getByText("Partner — last 4 in a row")).toBeInTheDocument();
    // …and stays hidden when the count is below 3.
    expect(screen.queryByText(/last 2 in a row/)).not.toBeInTheDocument();
    // Recent history: "<Performer> logged <Duty> at <time>".
    expect(screen.getByText("Partner logged School run at 4:15 PM")).toBeInTheDocument();
    // No household-wide total or winner anywhere.
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
  });

  it("9. quick-logs as the active adult with performedBy = actor id", async () => {
    renderWithProviders(<DutyLedgerTile />);

    const bedtime = await screen.findByRole("button", { name: /bedtime/i });
    await user.click(bedtime);

    expect(await screen.findByText("Logged Bedtime")).toBeInTheDocument();
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith({ dutyId: "duty-bedtime", performedBy: "member-you" });
  });

  it("9b. shows read-only cards and a hint for the child actor, with no log call", async () => {
    useActorStore.setState({ actorId: "member-kid" });

    renderWithProviders(<DutyLedgerTile />);

    expect(await screen.findByText("You 3 · Partner 5")).toBeInTheDocument();
    // Cards are not buttons for a child: nothing to tap, nothing to call.
    expect(screen.queryByRole("button", { name: /bedtime/i })).not.toBeInTheDocument();
    expect(screen.getByText("Adults only")).toBeInTheDocument();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("10. offers Undo after logging and calls undoEntry exactly once", async () => {
    renderWithProviders(<DutyLedgerTile />);

    const bedtime = await screen.findByRole("button", { name: /bedtime/i });
    await user.click(bedtime);

    const undo = await screen.findByRole("button", { name: "Undo" });
    await user.click(undo);

    expect(undoMock).toHaveBeenCalledTimes(1);
    expect(undoMock).toHaveBeenCalledWith("entry-1", "member-you");
    // The toast closes after a successful undo.
    expect(await screen.findByText("You 3 · Partner 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
