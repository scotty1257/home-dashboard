import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  BackupContact,
  HandoffBoardItem,
  HouseholdMember,
} from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const boardMock = vi.hoisted(() => vi.fn());
const contactsMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock },
    handoffs: {
      board: boardMock,
      claim: claimMock,
      requestBackup: vi.fn(),
      resolve: vi.fn(),
      create: vi.fn(),
    },
    backupContacts: { list: contactsMock, create: vi.fn(), update: vi.fn() },
  },
}));

import { HandoffBoard } from "./HandoffBoard";
import { useActorStore } from "../../lib/store";

const stamp = "2026-01-01T00:00:00.000Z";

/** Thursday, Jan 1 2026, 11:30 AM in the test machine's local zone. */
const START = new Date(2026, 0, 1, 11, 30);
const END = new Date(START.getTime() + 45 * 60_000);

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

const ITEM: HandoffBoardItem = {
  id: "handoff-1",
  eventId: "evt-1",
  startsAt: START.toISOString(),
  endsAt: END.toISOString(),
  status: "unclaimed",
  updatedBy: "member-you",
  createdAt: stamp,
  updatedAt: stamp,
  child: MEMBERS[2]!,
  eventSummary: {
    id: "evt-1",
    title: "Pickup",
    start: START.toISOString(),
    end: END.toISOString(),
    allDay: false,
  },
  attentionState: "urgent",
  availability: [
    { memberId: "member-you", state: "available", conflicts: [] },
    {
      memberId: "member-partner",
      state: "conflict",
      conflicts: [{ eventId: "evt-9", title: "Your call", start: stamp, end: stamp }],
    },
  ],
  recommendedMemberId: "member-you",
  conflictReason: "Pickup at 4:15 PM conflicts with Your call at 4:00 PM",
};

const CONTACTS: BackupContact[] = [
  { id: "contact-1", name: "Grandma", relationship: "Grandma", phone: "555-0100", priority: 1, active: true },
  { id: "contact-2", name: "Neighbor", relationship: "Neighbor", phone: "555-0101", priority: 2, active: true },
  { id: "contact-3", name: "After-care", relationship: "After-care", phone: "555-0102", priority: 3, active: true },
];

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
  boardMock.mockReset().mockResolvedValue({ items: [ITEM], from: stamp, to: stamp });
  contactsMock.mockReset().mockResolvedValue({ contacts: CONTACTS });
  claimMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HandoffBoard", () => {
  it("renders the unclaimed subtitle, contacts directly, and tel: links", async () => {
    renderWithProviders(<HandoffBoard />);

    expect(await screen.findByText("Unclaimed · Thursday · 11:30 AM")).toBeInTheDocument();
    expect(screen.getByText("Grandma · Grandma")).toBeInTheDocument();
    expect(screen.getByText("Neighbor · Neighbor")).toBeInTheDocument();
    expect(screen.getByText("After-care · After-care")).toBeInTheDocument();
    expect(screen.getByText("555-0100")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Call Grandma" })).toHaveAttribute("href", "tel:555-0100");
    expect(screen.getByRole("link", { name: "Call Neighbor" })).toHaveAttribute("href", "tel:555-0101");
    expect(screen.getByRole("link", { name: "Call After-care" })).toHaveAttribute("href", "tel:555-0102");
  });

  it("renders the conflict reason with a warning icon", async () => {
    renderWithProviders(<HandoffBoard />);

    expect(
      await screen.findByText("Pickup at 4:15 PM conflicts with Your call at 4:00 PM"),
    ).toBeInTheDocument();
    const conflict = document.querySelector("[data-conflict]");
    expect(conflict).not.toBeNull();
    expect(conflict!.querySelector("svg")).not.toBeNull();
  });

  it("claims once as the active adult and guards double taps", async () => {
    let resolveClaim!: (value: unknown) => void;
    claimMock.mockImplementation(
      () => new Promise((res) => { resolveClaim = res; }),
    );

    renderWithProviders(<HandoffBoard />);

    const claim = await screen.findByRole("button", { name: "Claim" });
    await user.click(claim);
    await user.click(claim); // disabled while pending → must not fire again
    expect(claimMock).toHaveBeenCalledTimes(1);
    expect(claimMock).toHaveBeenCalledWith("handoff-1", "member-you");

    resolveClaim({});
  });

  it("disables Claim for the child actor with an 'Adults only' hint", async () => {
    useActorStore.setState({ actorId: "member-kid" });

    renderWithProviders(<HandoffBoard />);

    const claim = await screen.findByRole("button", { name: "Claim" });
    expect(claim).toBeDisabled();
    expect(screen.getByText("Adults only")).toBeInTheDocument();
    await user.click(claim);
    expect(claimMock).not.toHaveBeenCalled();
  });
});
