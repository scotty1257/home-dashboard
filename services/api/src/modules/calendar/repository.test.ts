import { describe, it, expect, beforeEach } from "vitest";
import { Database } from "../../platform/database.js";
import { CalendarRepository } from "./repository.js";

function iso(d: Date): string {
  return d.toISOString();
}

function at(day: number, hour = 9): string {
  return iso(new Date(2026, 7, day, hour, 0, 0));
}

describe("CalendarRepository", () => {
  let db: Database;
  let repo: CalendarRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new CalendarRepository(db);
  });

  it("creates and lists events in a range", () => {
    repo.create({ title: "Standup", start: at(10), end: at(10, 10) });
    repo.create({ title: "Other day", start: at(20), end: at(20, 10) });

    const events = repo.list(at(9), at(11));
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe("Standup");
  });

  it("updates an event", () => {
    const created = repo.create({ title: "Old", start: at(10), end: at(10, 10) });
    repo.update(created.id, { title: "New", start: at(10), end: at(10, 10) });
    expect(repo.get(created.id)!.title).toBe("New");
  });

  it("deletes an event", () => {
    const created = repo.create({ title: "Gone", start: at(10), end: at(10, 10) });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeUndefined();
  });

  it("returns undefined for a missing id", () => {
    expect(repo.get("nope")).toBeUndefined();
    expect(repo.update("nope", { title: "x", start: at(10), end: at(10, 10) })).toBeUndefined();
  });

  it("expands daily recurring events within the queried range", () => {
    repo.create({
      title: "Daily standup",
      start: at(1),
      end: at(1, 10),
      recurrence: { frequency: "daily", interval: 1 },
    });

    const events = repo.list(at(1), at(4));
    const daily = events.filter((e) => e.id.includes("#"));
    // Base event (Aug 1) is returned as-is; recurrences cover Aug 2, 3, 4.
    expect(daily).toHaveLength(3);
    expect(events.length).toBe(4);
  });

  it("handles all-day events and persists color/location", () => {
    const created = repo.create({
      title: "Vacation",
      start: at(1),
      end: at(5),
      allDay: true,
      location: "Italy",
      color: "coral",
    });
    expect(created.allDay).toBe(true);
    expect(created.location).toBe("Italy");
    expect(created.color).toBe("coral");
  });
});
