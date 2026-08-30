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

import { FamilyAlertBanner } from "./FamilyAlertBanner";
import { useNavStore } from "../../lib/store";

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
  boardMock.mockReset().mockResolvedValue({ items: [], from: stamp, to: stamp });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FamilyAlertBanner", () => {
  it("shows a night-before unclaimed handoff with a Go to Family action", async () => {
    const user = userEvent.setup();
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE], from: stamp, to: stamp });

    renderWithProviders(<FamilyAlertBanner />);

    expect(await screen.findByText(/still unclaimed/i)).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Go to Family" });
    await user.click(go);
    expect(useNavStore.getState().view).toBe("family");
  });

  it("stays hidden when nothing needs attention (claimed, resolved, planned)", async () => {
    boardMock.mockResolvedValue({ items: [CLAIMED, RESOLVED, PLANNED], from: stamp, to: stamp });

    renderWithProviders(<FamilyAlertBanner />);
    await waitFor(() => expect(boardMock).toHaveBeenCalled());

    expect(screen.queryByText(/unclaimed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to Family" })).not.toBeInTheDocument();
  });

  it("lists urgent items above night-before items", async () => {
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE, URGENT], from: stamp, to: stamp });

    renderWithProviders(<FamilyAlertBanner />);

    const urgent = await screen.findByText(/^Now: .* unclaimed$/);
    const nightBefore = screen.getByText(/^Tomorrow's .* still unclaimed$/);
    // The urgent row renders first in the document.
    expect(urgent.compareDocumentPosition(nightBefore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("dismisses per item and reappears for a new item", async () => {
    const user = userEvent.setup();
    const queryClient = makeQueryClient();
    boardMock.mockResolvedValue({ items: [NIGHT_BEFORE], from: stamp, to: stamp });

    renderWithProviders(<FamilyAlertBanner />, { queryClient });

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
});
