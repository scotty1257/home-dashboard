import type { CalendarEvent, ColorToken } from "@home-dashboard/contracts";

/** The event-list narrowing controlled by the calendar toolbar. */
export interface CalendarFilter {
  /** Free text matched against title, location, and notes. */
  query: string;
  /** Owner ids to keep; empty means every owner. */
  owners: string[];
  /** Color tokens to keep; empty means every color. */
  colors: ColorToken[];
  /** When true, only events flagged as needing a handoff. */
  handoffOnly: boolean;
}

export const EMPTY_FILTER: CalendarFilter = {
  query: "",
  owners: [],
  colors: [],
  handoffOnly: false,
};

/** True when any narrowing is active — drives the "clear filters" affordance. */
export function isFiltering(filter: CalendarFilter): boolean {
  return (
    filter.query.trim().length > 0 ||
    filter.owners.length > 0 ||
    filter.colors.length > 0 ||
    filter.handoffOnly
  );
}

function matchesQuery(event: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [event.title, event.location, event.notes].some((field) =>
    field?.toLowerCase().includes(q),
  );
}

/** Apply the toolbar's narrowing to a list of events. */
export function applyFilter(events: CalendarEvent[], filter: CalendarFilter): CalendarEvent[] {
  return events.filter((event) => {
    if (!matchesQuery(event, filter.query)) return false;
    // An unowned event can never match an owner narrowing.
    if (filter.owners.length > 0 && !(event.ownerId && filter.owners.includes(event.ownerId))) {
      return false;
    }
    if (filter.colors.length > 0 && !filter.colors.includes(event.color)) return false;
    if (filter.handoffOnly && !event.requiresHandoff) return false;
    return true;
  });
}

/** Toggle one value in a filter's array facet. */
export function toggleFacet<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
