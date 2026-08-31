import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdMember } from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const listMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: listMock },
    calendar: { create: createMock, update: vi.fn(), remove: vi.fn() },
  },
}));

import { EventEditorSheet } from "./EventEditorSheet";

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
    sortOrder: 1,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
];

const user = userEvent.setup();

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue({ members: MEMBERS });
  createMock.mockReset();
  createMock.mockResolvedValue({});
});

describe("EventEditorSheet family scheduling fields", () => {
  it("renders Owner and Schedule kind; 'Needs handoff' only appears for child commitments", async () => {
    renderWithProviders(
      <EventEditorSheet open initial={{ date: new Date(2026, 7, 15) }} onClose={() => {}} />,
    );

    expect(await screen.findByRole("combobox", { name: "Owner" })).toBeInTheDocument();
    const kind = screen.getByRole("combobox", { name: "Schedule kind" });
    expect(kind).toBeInTheDocument();
    // General events have no handoff semantics, so the toggle stays hidden.
    expect(screen.queryByRole("switch", { name: /needs handoff/i })).not.toBeInTheDocument();

    await user.click(kind);
    await user.click(await screen.findByRole("option", { name: "Child commitment" }));
    expect(await screen.findByRole("switch", { name: /needs handoff/i })).toBeInTheDocument();
  });

  it("saves ownerId, scheduleKind, and requiresHandoff", async () => {
    renderWithProviders(
      <EventEditorSheet open initial={{ date: new Date(2026, 7, 15) }} onClose={() => {}} />,
    );

    await user.click(await screen.findByRole("combobox", { name: "Owner" }));
    await user.click(await screen.findByRole("option", { name: "Kid" }));
    await user.click(screen.getByRole("combobox", { name: "Schedule kind" }));
    await user.click(await screen.findByRole("option", { name: "Child commitment" }));
    await user.click(screen.getByRole("switch", { name: /needs handoff/i }));
    await user.type(screen.getByPlaceholderText(/what's happening/i), "Soccer");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "member-kid",
        scheduleKind: "child-commitment",
        requiresHandoff: true,
      }),
    );
  });
});
