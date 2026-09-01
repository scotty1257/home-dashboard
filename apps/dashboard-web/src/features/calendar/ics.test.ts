import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { toIcs } from "./ics";

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    calendarId: "local",
    title: overrides.id,
    start: "2026-08-10T09:00:00.000Z",
    end: "2026-08-10T10:00:00.000Z",
    allDay: false,
    color: "sky",
    recurrence: { frequency: "none", interval: 1 },
    reminders: [],
    scheduleKind: "general",
    requiresHandoff: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toIcs", () => {
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = toIcs([event({ id: "a", title: "Standup" })]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Standup");
  });

  it("writes timed events as UTC stamps", () => {
    const ics = toIcs([event({ id: "a" })]);
    expect(ics).toContain("DTSTART:20260810T090000Z");
    expect(ics).toContain("DTEND:20260810T100000Z");
  });

  it("writes all-day events as DATE values", () => {
    const ics = toIcs([event({ id: "a", allDay: true })]);
    expect(ics).toContain("DTSTART;VALUE=DATE:");
    expect(ics).not.toContain("DTSTART:2026");
  });

  it("escapes commas, semicolons, backslashes, and newlines", () => {
    const ics = toIcs([event({ id: "a", title: "Tea, cake; and \\ more\nlater" })]);
    expect(ics).toContain(String.raw`SUMMARY:Tea\, cake\; and \\ more\nlater`);
  });

  it("emits an RRULE for a recurring event", () => {
    const ics = toIcs([
      event({
        id: "a",
        recurrence: { frequency: "weekly", interval: 2, daysOfWeek: [1, 3], until: "2026-12-31T00:00:00.000Z" },
      }),
    ]);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T000000Z");
  });

  it("omits INTERVAL when it is 1", () => {
    const ics = toIcs([event({ id: "a", recurrence: { frequency: "daily", interval: 1 } })]);
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).not.toContain("INTERVAL");
  });

  it("emits a VALARM per reminder", () => {
    const ics = toIcs([
      event({ id: "a", reminders: [{ minutesBefore: 10, delivered: false }] }),
    ]);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT10M");
  });

  it("skips expanded recurrence occurrences so imports are not duplicated", () => {
    const ics = toIcs([
      event({ id: "base", title: "Weekly" }),
      event({ id: "base#2026-08-17T09:00:00.000Z", title: "Weekly" }),
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("folds lines longer than 75 octets", () => {
    const ics = toIcs([event({ id: "a", title: "x".repeat(200) })]);
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});
