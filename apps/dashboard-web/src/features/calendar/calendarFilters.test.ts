import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@home-dashboard/contracts";
import {
  applyFilter,
  EMPTY_FILTER,
  isFiltering,
  toggleFacet,
} from "./calendarFilters";

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    calendarId: "local",
    title: overrides.id,
    start: "2026-08-10T09:00:00Z",
    end: "2026-08-10T10:00:00Z",
    allDay: false,
    color: "sky",
    recurrence: { frequency: "none", interval: 1 },
    reminders: [],
    scheduleKind: "general",
    requiresHandoff: false,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const EVENTS: CalendarEvent[] = [
  event({ id: "dentist", title: "Dentist", location: "Main St", ownerId: "mum", color: "coral" }),
  event({ id: "soccer", title: "Soccer", notes: "bring boots", ownerId: "kid", requiresHandoff: true }),
  event({ id: "dinner", title: "Dinner", color: "teal" }),
];

const ids = (events: CalendarEvent[]) => events.map((e) => e.id).sort();

describe("applyFilter", () => {
  it("returns everything when nothing is narrowed", () => {
    expect(applyFilter(EVENTS, EMPTY_FILTER)).toHaveLength(3);
  });

  it("matches the query against title, location, and notes", () => {
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, query: "dent" }))).toEqual(["dentist"]);
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, query: "main st" }))).toEqual(["dentist"]);
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, query: "boots" }))).toEqual(["soccer"]);
  });

  it("ignores case and surrounding whitespace in the query", () => {
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, query: "  SOCCER " }))).toEqual(["soccer"]);
  });

  it("keeps only the selected owners, excluding unowned events", () => {
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, owners: ["kid"] }))).toEqual(["soccer"]);
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, owners: ["kid", "mum"] }))).toEqual([
      "dentist",
      "soccer",
    ]);
  });

  it("keeps only the selected colors", () => {
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, colors: ["teal"] }))).toEqual(["dinner"]);
  });

  it("keeps only handoff events when asked", () => {
    expect(ids(applyFilter(EVENTS, { ...EMPTY_FILTER, handoffOnly: true }))).toEqual(["soccer"]);
  });

  it("intersects facets rather than unioning them", () => {
    const result = applyFilter(EVENTS, { ...EMPTY_FILTER, owners: ["mum"], colors: ["teal"] });
    expect(result).toHaveLength(0);
  });
});

describe("isFiltering", () => {
  it("is false for the empty filter and for whitespace-only queries", () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, query: "   " })).toBe(false);
  });

  it("is true once any facet is set", () => {
    expect(isFiltering({ ...EMPTY_FILTER, query: "a" })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, owners: ["kid"] })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, colors: ["sky"] })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, handoffOnly: true })).toBe(true);
  });
});

describe("toggleFacet", () => {
  it("adds a missing value and removes a present one", () => {
    expect(toggleFacet(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFacet(["a", "b"], "a")).toEqual(["b"]);
  });
});
