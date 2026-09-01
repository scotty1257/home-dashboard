import { describe, it, expect } from "vitest";
import {
  allDayOn,
  dateKey,
  daySpan,
  eventsOnDay,
  layoutDay,
  MIN_EVENT_MINUTES,
  monthGrid,
  sameDay,
  spansWholeDay,
  startOfWeek,
  timedOn,
  weekDays,
} from "./calendarUtils";
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
  scheduleKind: "general",
  requiresHandoff: false,
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

describe("time-grid layout", () => {
  const day = new Date(2026, 7, 10);
  const at = (hour: number, minute = 0) =>
    new Date(2026, 7, 10, hour, minute, 0).toISOString();

  it("gives a lone event the full width", () => {
    const laid = layoutDay([base("solo", at(9), at(10))], day);
    expect(laid).toHaveLength(1);
    expect(laid[0]!.columns).toBe(1);
    expect(laid[0]!.column).toBe(0);
  });

  it("positions an event by minutes from midnight", () => {
    const laid = layoutDay([base("mid", at(9, 30), at(11))], day);
    expect(laid[0]!.top).toBe(570);
    expect(laid[0]!.bottom).toBe(660);
  });

  it("splits two overlapping events into side-by-side columns", () => {
    const laid = layoutDay(
      [base("a", at(9), at(11)), base("b", at(10), at(12))],
      day,
    );
    expect(laid.map((l) => l.column).sort()).toEqual([0, 1]);
    expect(laid.every((l) => l.columns === 2)).toBe(true);
  });

  it("widens every event in a cluster to the cluster's depth", () => {
    const laid = layoutDay(
      [base("a", at(9), at(12)), base("b", at(9, 30), at(12)), base("c", at(10), at(12))],
      day,
    );
    expect(laid.every((l) => l.columns === 3)).toBe(true);
  });

  it("reuses a column once the previous event has ended", () => {
    const laid = layoutDay(
      [base("a", at(9), at(10)), base("b", at(10), at(11))],
      day,
    );
    // Back-to-back events do not overlap, so both stay full width.
    expect(laid.every((l) => l.columns === 1)).toBe(true);
  });

  it("clips a multi-day span to the day it is drawn on", () => {
    const spanning = base(
      "trip",
      new Date(2026, 7, 9, 20, 0).toISOString(),
      new Date(2026, 7, 11, 8, 0).toISOString(),
    );
    const { top, bottom } = daySpan(spanning, day);
    expect(top).toBe(0);
    expect(bottom).toBe(1440);
    expect(spansWholeDay(spanning, day)).toBe(true);
  });

  it("gives a zero-length event a tappable minimum height", () => {
    const laid = layoutDay([base("instant", at(9), at(9))], day);
    expect(laid[0]!.bottom - laid[0]!.top).toBe(MIN_EVENT_MINUTES);
  });

  it("separates all-day events from timed ones", () => {
    const events = [
      base("holiday", at(0), at(23, 59), true),
      base("meeting", at(9), at(10)),
    ];
    expect(allDayOn(events, day).map((e) => e.id)).toEqual(["holiday"]);
    expect(timedOn(events, day).map((e) => e.id)).toEqual(["meeting"]);
  });
});

describe("week helpers", () => {
  it("starts a week on the Sunday on or before the date", () => {
    // 2026-08-12 is a Wednesday.
    expect(dateKey(startOfWeek(new Date(2026, 7, 12)))).toBe("2026-08-09");
  });

  it("returns seven consecutive days", () => {
    const days = weekDays(new Date(2026, 7, 12));
    expect(days).toHaveLength(7);
    expect(dateKey(days[0]!)).toBe("2026-08-09");
    expect(dateKey(days[6]!)).toBe("2026-08-15");
  });

  it("compares days ignoring the time of day", () => {
    expect(sameDay(new Date(2026, 7, 12, 1), new Date(2026, 7, 12, 23))).toBe(true);
    expect(sameDay(new Date(2026, 7, 12), new Date(2026, 7, 13))).toBe(false);
  });
});
