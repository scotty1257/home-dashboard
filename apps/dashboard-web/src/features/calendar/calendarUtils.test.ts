import { describe, it, expect } from "vitest";
import { eventsOnDay, monthGrid, dateKey } from "./calendarUtils";
import type { CalendarEvent } from "@home-dashboard/contracts";

const base = (id: string, start: string, end: string, allDay = false): CalendarEvent => ({
  id,
  calendarId: "local",
  title: id,
  start,
  end,
  allDay,
  color: "sky",
  recurrence: { frequency: "none", interval: 1 },
  reminders: [],
  createdAt: start,
  updatedAt: start,
});

describe("calendarUtils", () => {
  it("builds a 42-cell grid starting on the correct weekday", () => {
    const cells = monthGrid(2026, 7); // August 2026 starts on a Saturday
    expect(cells).toHaveLength(42);
    expect(dateKey(cells[0]!.date)).toBe("2026-07-26"); // Sunday before Aug 1
  });

  it("filters events on a given day including multi-day spans", () => {
    const events = [
      base("a", "2026-08-10T09:00:00Z", "2026-08-10T10:00:00Z"),
      base("multi", "2026-08-09T00:00:00Z", "2026-08-11T00:00:00Z"),
      base("other", "2026-08-12T09:00:00Z", "2026-08-12T10:00:00Z"),
    ];
    const day = new Date(2026, 7, 10);
    const result = eventsOnDay(events, day);
    expect(result.map((e) => e.id).sort()).toEqual(["a", "multi"]);
  });

  it("marks today correctly", () => {
    const today = new Date();
    const cells = monthGrid(today.getFullYear(), today.getMonth());
    const todayCell = cells.find((c) => c.isToday);
    expect(todayCell).toBeDefined();
  });
});
