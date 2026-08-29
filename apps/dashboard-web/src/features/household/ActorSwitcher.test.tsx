import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdMember } from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: {
      list: listMock,
    },
  },
}));

import { ActorSwitcher, useActiveActor } from "./ActorSwitcher";
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

/** Mirrors the active actor outside React so tests can assert on the hook. */
let probe: { actorId: string | null; actor: HouseholdMember | null } = {
  actorId: null,
  actor: null,
};

function Probe() {
  const { actor } = useActiveActor();
  probe = { actorId: actor?.id ?? null, actor: actor ?? null };
  return null;
}

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
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
}

let storage: Storage;

const user = userEvent.setup();

beforeEach(() => {
  storage = makeLocalStorage();
  vi.stubGlobal("localStorage", storage);
  useActorStore.setState({ actorId: null });
  listMock.mockReset();
  listMock.mockResolvedValue({ members: MEMBERS });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ActorSwitcher", () => {
  it("defaults to the first adult and shows their name on the trigger", async () => {
    renderWithProviders(
      <>
        <ActorSwitcher />
        <Probe />
      </>,
    );
    const trigger = await screen.findByRole("button", { name: "Active person" });
    expect(trigger.textContent).toContain("You");
    expect(trigger.className).toContain("min-h-12");
    expect(probe.actor?.id).toBe("member-you");
  });

  it("switches to Partner on tap, persists to localStorage, and the hook reflects it", async () => {
    const setItem = vi.spyOn(storage, "setItem");
    renderWithProviders(
      <>
        <ActorSwitcher />
        <Probe />
      </>,
    );
    await screen.findByRole("button", { name: "Active person" });
    await user.click(screen.getByRole("button", { name: "Active person" }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /Partner/ }));
    expect(screen.getByRole("button", { name: "Active person" }).textContent).toContain("Partner");
    expect(setItem).toHaveBeenCalledWith("dashboard.actorId", "member-partner");
    expect(probe.actorId).toBe("member-partner");
  });

  it("can select the child member", async () => {
    renderWithProviders(
      <>
        <ActorSwitcher />
        <Probe />
      </>,
    );
    await screen.findByRole("button", { name: "Active person" });
    await user.click(screen.getByRole("button", { name: "Active person" }));
    await user.click(await screen.findByRole("menuitem", { name: /Kid/ }));
    expect(screen.getByRole("button", { name: "Active person" }).textContent).toContain("Kid");
    expect(probe.actorId).toBe("member-kid");
  });

  it("renders one ≥48px row per member with aria-current on the active one", async () => {
    renderWithProviders(
      <>
        <ActorSwitcher />
        <Probe />
      </>,
    );
    await screen.findByRole("button", { name: "Active person" });
    await user.click(screen.getByRole("button", { name: "Active person" }));
    const menu = await screen.findByRole("menu");
    const rows = within(menu).getAllByRole("menuitem");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.className).toContain("min-h-12");
    }
    const activeRow = within(menu).getByRole("menuitem", { name: /You/ });
    expect(activeRow.getAttribute("aria-current")).toBe("true");
    const inactiveRow = within(menu).getByRole("menuitem", { name: /Kid/ });
    expect(inactiveRow.hasAttribute("aria-current")).toBe(false);
  });

  it("falls back to the first adult when the stored actor id is stale", async () => {
    storage.setItem("dashboard.actorId", "member-ghost");
    renderWithProviders(
      <>
        <ActorSwitcher />
        <Probe />
      </>,
    );
    const trigger = await screen.findByRole("button", { name: "Active person" });
    expect(trigger.textContent).toContain("You");
    expect(probe.actor?.id).toBe("member-you");
  });

  it("closes the popover on Escape", async () => {
    renderWithProviders(<ActorSwitcher />);
    await screen.findByRole("button", { name: "Active person" });
    await user.click(screen.getByRole("button", { name: "Active person" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
