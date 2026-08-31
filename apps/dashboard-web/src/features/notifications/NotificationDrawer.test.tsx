import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HandoffBoardItem } from "@home-dashboard/contracts";
import { renderWithProviders, makeQueryClient } from "../../test/renderWithProviders";

const boardMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    handoffs: { board: boardMock },
  },
}));

import { NotificationDrawer } from "./NotificationDrawer";
import { NotificationBell } from "./NotificationBell";
import { useNavStore, useNotificationStore } from "../../lib/store";

const stamp = "2026-01-01T00:00:00.000Z";

/** Thursday, Jan 1 2026, 12:30 PM local — "urgent" fixture start. */
const URGENT_START = new Date(2026, 0, 1, 12, 30);
/** Friday, Jan 2 2026, 4:15 PM local — "night-before" fixture start. */
const TOMORROW_START = new Date(2026, 0, 2, 16, 15);

function boardItem(overrides: Partial<HandoffBoardItem>): HandoffBoardItem {
  return {
    id: "handoff-1",
    eventId: "evt-1",
    startsAt: TOMORROW_START.toISOString(),
    endsAt: new Date(TOMORROW_START.getTime() + 45 * 60_000).toISOString(),
    status: "unclaimed",
    updatedBy: "member-you",
    createdAt: stamp,
    updatedAt: stamp,
    child: null,
    eventSummary: {
      id: "evt-1",
      title: "Pickup",
      start: TOMORROW_START.toISOString(),
      end: new Date(TOMORROW_START.getTime() + 45 * 60_000).toISOString(),
      allDay: false,
    },
    attentionState: "night-before",
    availability: [],
    ...overrides,
  };
}

const NIGHT_BEFORE = boardItem({});
const URGENT = boardItem({
  id: "handoff-2",
  eventId: "evt-2",
  startsAt: URGENT_START.toISOString(),
  endsAt: new Date(URGENT_START.getTime() + 45 * 60_000).toISOString(),
  attentionState: "urgent",
  eventSummary: {
    id: "evt-2",
    title: "Swim pickup",
    start: URGENT_START.toISOString(),
    end: new Date(URGENT_START.getTime() + 45 * 60_000).toISOString(),
    allDay: false,
  },
});
const CLAIMED = boardItem({ status: "claimed", attentionState: "planned" });
const RESOLVED = boardItem({ status: "resolved", attentionState: "resolved" });
const PLANNED = boardItem({ attentionState: "planned" });

beforeEach(() => {
  useNavStore.setState({ view: "today" });
  useNotificationStore.setState({ open: true });
  boardMock.mockReset().mockResolvedValue({ items: [], from: stamp, to: stamp });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotificationDrawer", () => {
  it("shows a night-before unclaimed handoff with a Go to Family action", async () => {
    const user = userEvent.setup();
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />);

    expect(await screen.findByText(/still unclaimed/i)).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Go to Family" });
    await user.click(go);
    expect(useNavStore.getState().view).toBe("family");
    expect(useNotificationStore.getState().open).toBe(false);
  });

  it("shows an empty state when nothing needs attention (claimed, resolved, planned)", async () => {
    boardMock.mockResolvedValue({ items: [CLAIMED, RESOLVED, PLANNED], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />);
    await waitFor(() => expect(boardMock).toHaveBeenCalled());

    expect(screen.queryByText(/unclaimed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to Family" })).not.toBeInTheDocument();
    expect(await screen.findByText(/nothing needs an adult/i)).toBeInTheDocument();
  });

  it("lists urgent items above night-before items", async () => {
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE, URGENT], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />);

    const urgent = await screen.findByText(/^Now: .* unclaimed$/);
    const nightBefore = screen.getByText(/^Tomorrow's .* still unclaimed$/);
    // The urgent row renders first in the document.
    expect(urgent.compareDocumentPosition(nightBefore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("dismisses per item and reappears for a new item", async () => {
    const user = userEvent.setup();
    const queryClient = makeQueryClient();
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />, { queryClient });

    expect(await screen.findByText(/still unclaimed/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText(/still unclaimed/i)).not.toBeInTheDocument());

    // A different unclaimed obligation (new id) must break through again.
    const freshStart = new Date(2026, 0, 3, 10, 0);
    const fresh = boardItem({
      id: "handoff-9",
      eventId: "evt-9",
      startsAt: freshStart.toISOString(),
      endsAt: new Date(freshStart.getTime() + 45 * 60_000).toISOString(),
      eventSummary: {
        id: "evt-9",
        title: "Dentist pickup",
        start: freshStart.toISOString(),
        end: new Date(freshStart.getTime() + 45 * 60_000).toISOString(),
        allDay: false,
      },
    });
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE, fresh], from: stamp, to: stamp });
    queryClient.invalidateQueries({ queryKey: ["handoffs"] });

    const rows = await screen.findAllByText(/still unclaimed/i);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Dentist pickup");
  });
  it("collapses handoffs that say the same thing into one counted row", async () => {
    // The same pickup entered twice (different obligation ids, identical
    // message) must not stack up as separate alerts.
    const twin = boardItem({ id: "handoff-twin", eventId: "evt-twin" });
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE, twin], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />);

    const rows = await screen.findAllByText(/still unclaimed/i);
    expect(rows).toHaveLength(1);
    expect(await screen.findByText("×2")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />);
    expect(await screen.findByText(/still unclaimed/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(useNotificationStore.getState().open).toBe(false);
  });

  it("closes from the close button", async () => {
    const user = userEvent.setup();
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE], from: stamp, to: stamp });

    renderWithProviders(<NotificationDrawer />);
    expect(await screen.findByText(/still unclaimed/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close notifications" }));
    expect(useNotificationStore.getState().open).toBe(false);
  });
});

describe("NotificationBell", () => {
  it("badges the number of handoffs needing an adult and opens the drawer", async () => {
    const user = userEvent.setup();
    useNotificationStore.setState({ open: false });
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE, URGENT], from: stamp, to: stamp });

    renderWithProviders(<NotificationBell />);

    const bell = await screen.findByRole("button", { name: /2 needing attention/i });
    expect(bell).toBeInTheDocument();
    await user.click(bell);
    expect(useNotificationStore.getState().open).toBe(true);
  });

  it("shows no badge when nothing needs attention", async () => {
    boardMock.mockResolvedValue({ items: [CLAIMED, RESOLVED, PLANNED], from: stamp, to: stamp });

    renderWithProviders(<NotificationBell />);

    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });
});
