import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  HouseholdMember,
  PermissionRequest,
  PermissionRequestWithDecisions,
  PermissionRule,
} from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const queueMock = vi.hoisted(() => vi.fn());
const decideMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const reopenMock = vi.hoisted(() => vi.fn());
const rulesMock = vi.hoisted(() => vi.fn());
const ruleCreateMock = vi.hoisted(() => vi.fn());
const ruleUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock },
    permissions: {
      queue: queueMock,
      create: createMock,
      decide: decideMock,
      reopen: reopenMock,
    },
    permissionRules: {
      list: rulesMock,
      create: ruleCreateMock,
      update: ruleUpdateMock,
    },
  },
}));

import { PermissionQueue } from "./PermissionQueue";
import { useActorStore } from "../../lib/store";

const stamp = "2026-01-01T00:00:00.000Z";

/** Local-zone instants so the formatted hour/minute strings are deterministic. */
const AT_6_12_PM = new Date(2026, 0, 1, 18, 12).toISOString(); // → "6:12 PM"
const AT_3_02_PM = new Date(2026, 0, 1, 15, 2).toISOString(); // → "3:02 PM"
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

const PENDING: PermissionRequest = {
  id: "perm-1",
  childId: "member-kid",
  category: "sleepover",
  question: "Can I sleep over at Maya's on Friday?",
  occursAt: new Date(2026, 0, 2, 17, 0).toISOString(),
  expiresAt: undefined,
  status: "pending",
  ruleConflict: null,
  createdBy: "member-kid",
  createdAt: stamp,
  updatedAt: stamp,
};

const CONFLICTING: PermissionRequest = {
  ...PENDING,
  id: "perm-conflict",
  question: "Pool party Saturday?",
  category: "outing",
  ruleConflict: "Two active rules disagree on outings",
};

/** Auto-approved by the Friday-sleepovers standing rule. */
const APPROVED_BY_RULE: PermissionRequestWithDecisions = {
  id: "perm-2",
  childId: "member-kid",
  category: "sleepover",
  question: "Sleepover at Maya's?",
  occursAt: undefined,
  expiresAt: undefined,
  status: "approved",
  ruleConflict: null,
  createdBy: "member-kid",
  createdAt: stamp,
  updatedAt: AT_6_12_PM,
  decisions: [
    {
      id: "dec-2",
      requestId: "perm-2",
      outcome: "approved",
      decidedBy: "member-you",
      decidedAt: AT_6_12_PM,
      source: "standing-rule",
      ruleId: "rule-1",
    },
  ],
};

const DENIED_BY_PARTNER: PermissionRequestWithDecisions = {
  id: "perm-3",
  childId: "member-kid",
  category: "purchase",
  question: "New soccer cleats?",
  occursAt: undefined,
  expiresAt: undefined,
  status: "denied",
  ruleConflict: null,
  createdBy: "member-kid",
  createdAt: stamp,
  updatedAt: AT_3_02_PM,
  decisions: [
    {
      id: "dec-3",
      requestId: "perm-3",
      outcome: "denied",
      decidedBy: "member-partner",
      decidedAt: AT_3_02_PM,
      source: "manual",
    },
  ],
};

/** Denied, reopened with a reason, then re-approved — full history kept. */
const REOPENED: PermissionRequestWithDecisions = {
  id: "perm-4",
  childId: "member-kid",
  category: "purchase",
  question: "Skate park Saturday?",
  occursAt: undefined,
  expiresAt: undefined,
  status: "approved",
  ruleConflict: null,
  createdBy: "member-kid",
  createdAt: stamp,
  updatedAt: AT_6_12_PM,
  decisions: [
    {
      id: "dec-4a",
      requestId: "perm-4",
      outcome: "denied",
      decidedBy: "member-partner",
      decidedAt: AT_3_02_PM,
      source: "manual",
    },
    {
      id: "dec-4b",
      requestId: "perm-4",
      outcome: "reopened",
      decidedBy: "member-you",
      decidedAt: AT_4_15_PM,
      source: "manual",
      note: "Grandma offered to drive",
    },
    {
      id: "dec-4c",
      requestId: "perm-4",
      outcome: "approved",
      decidedBy: "member-you",
      decidedAt: AT_6_12_PM,
      source: "manual",
    },
  ],
};

const RULES: PermissionRule[] = [
  {
    id: "rule-1",
    name: "Friday sleepovers",
    category: "sleepover",
    outcome: "approved",
    weekdays: [5],
    localStartTime: undefined,
    localEndTime: undefined,
    activeFrom: undefined,
    activeUntil: undefined,
    priority: 1,
    active: true,
    createdBy: "member-you",
    createdAt: stamp,
    updatedAt: stamp,
  },
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
  queueMock.mockReset().mockResolvedValue({ pending: [], recent: [] });
  rulesMock.mockReset().mockResolvedValue({ rules: RULES });
  decideMock.mockReset().mockResolvedValue({});
  createMock.mockReset().mockResolvedValue({});
  reopenMock.mockReset().mockResolvedValue({});
  ruleCreateMock.mockReset().mockResolvedValue({});
  ruleUpdateMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PermissionQueue", () => {
  it("renders Approve/Deny for the adult actor and guards double taps", async () => {
    queueMock.mockResolvedValue({ pending: [PENDING], recent: [] });
    let resolveDecide!: (value: unknown) => void;
    decideMock.mockImplementation(() => new Promise((res) => { resolveDecide = res; }));

    renderWithProviders(<PermissionQueue />);

    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
    await user.click(approve);
    await user.click(approve); // disabled while pending → must not fire again
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decideMock).toHaveBeenCalledWith("perm-1", { actorId: "member-you", outcome: "approved" });

    resolveDecide({ request: REOPENED });
  });

  it("hides Approve/Deny for the child actor with an 'Adults only' hint", async () => {
    useActorStore.setState({ actorId: "member-kid" });
    queueMock.mockResolvedValue({ pending: [PENDING], recent: [] });

    renderWithProviders(<PermissionQueue />);

    expect(await screen.findByText("Can I sleep over at Maya's on Friday?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
    expect(screen.getByText("Adults only")).toBeInTheDocument();
    expect(decideMock).not.toHaveBeenCalled();
  });

  it("shows the latest decision with standing-rule provenance", async () => {
    queueMock.mockResolvedValue({ pending: [], recent: [APPROVED_BY_RULE, DENIED_BY_PARTNER] });

    renderWithProviders(<PermissionQueue />);

    expect(await screen.findByText("Approved by You, 6:12 PM")).toBeInTheDocument();
    expect(screen.getByText("Standing rule · Friday sleepovers")).toBeInTheDocument();
    expect(screen.getByText("Denied by Partner, 3:02 PM")).toBeInTheDocument();
  });

  it("keeps recent decisions visible when the pending queue is empty", async () => {
    queueMock.mockResolvedValue({ pending: [], recent: [DENIED_BY_PARTNER] });

    renderWithProviders(<PermissionQueue />);

    // Await a data-dependent node first: the empty-pending copy also shows
    // while the query is still loading, so it can't prove data landed.
    expect(await screen.findByText("Denied by Partner, 3:02 PM")).toBeInTheDocument();
    expect(screen.getByText("No pending requests.")).toBeInTheDocument();
  });

  it("shows the full decision history for a reopened request", async () => {
    queueMock.mockResolvedValue({ pending: [], recent: [REOPENED] });

    renderWithProviders(<PermissionQueue />);

    expect(await screen.findByText("Denied by Partner, 3:02 PM")).toBeInTheDocument();
    expect(screen.getByText("Reopened by You, 4:15 PM")).toBeInTheDocument();
    expect(screen.getByText("Approved by You, 6:12 PM")).toBeInTheDocument();
  });

  it("renders the ruleConflict warning on a conflicting pending request", async () => {
    queueMock.mockResolvedValue({ pending: [CONFLICTING], recent: [] });

    renderWithProviders(<PermissionQueue />);

    expect(await screen.findByText("Two active rules disagree on outings")).toBeInTheDocument();
    const conflict = document.querySelector("[data-conflict]");
    expect(conflict).not.toBeNull();
    expect(conflict!.querySelector("svg")).not.toBeNull();
  });
});
