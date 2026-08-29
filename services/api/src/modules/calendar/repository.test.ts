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

  describe("family scheduling fields", () => {
    function obligation(eventId: string) {
      return db
        .prepare(`SELECT * FROM handoff_obligations WHERE event_id = ?`)
        .get(eventId) as
        | { id: string; event_id: string; starts_at: string; ends_at: string; status: string }
        | undefined;
    }

    it("round-trips ownerId, scheduleKind, and requiresHandoff", () => {
      const created = repo.create({
        title: "Soccer practice",
        start: at(10),
        end: at(10, 10),
        ownerId: "member-kid",
        scheduleKind: "child-commitment",
        requiresHandoff: true,
      });
      expect(created.ownerId).toBe("member-kid");
      expect(created.scheduleKind).toBe("child-commitment");
      expect(created.requiresHandoff).toBe(true);

      const updated = repo.update(created.id, {
        title: "Soccer practice",
        start: at(10),
        end: at(10, 10),
        ownerId: "member-kid",
        scheduleKind: "child-commitment",
        requiresHandoff: false,
      });
      expect(updated!.ownerId).toBe("member-kid");
      expect(updated!.scheduleKind).toBe("child-commitment");
      expect(updated!.requiresHandoff).toBe(false);
    });

    it("parses legacy rows that predate the family columns using contract defaults", () => {
      db.prepare(
        `INSERT INTO calendar_events (id, title, start_at, end_at, created_at, updated_at)
         VALUES ('legacy-1', 'Legacy', ?, ?, ?, ?)`,
      ).run(at(10), at(10, 10), at(1), at(1));
      const event = repo.get("legacy-1")!;
      expect(event.title).toBe("Legacy");
      expect(event.ownerId).toBeUndefined();
      expect(event.scheduleKind).toBe("general");
      expect(event.requiresHandoff).toBe(false);
    });

    it("creates an unclaimed handoff obligation matching the event window", () => {
      const created = repo.create({
        title: "Pickup",
        start: at(10),
        end: at(10, 10),
        scheduleKind: "child-commitment",
        requiresHandoff: true,
      });
      const row = obligation(created.id);
      expect(row).toBeDefined();
      expect(row!.status).toBe("unclaimed");
      expect(row!.starts_at).toBe(created.start);
      expect(row!.ends_at).toBe(created.end);
    });

    it("moves the obligation window when event times change", () => {
      const created = repo.create({
        title: "Pickup",
        start: at(10),
        end: at(10, 10),
        requiresHandoff: true,
      });
      repo.update(created.id, {
        title: "Pickup",
        start: at(12),
        end: at(12, 10),
        requiresHandoff: true,
      });
      const row = obligation(created.id);
      expect(row!.starts_at).toBe(at(12));
      expect(row!.ends_at).toBe(at(12, 10));
    });

    it("deletes an unclaimed obligation when requiresHandoff turns off", () => {
      const created = repo.create({
        title: "Pickup",
        start: at(10),
        end: at(10, 10),
        requiresHandoff: true,
      });
      expect(obligation(created.id)).toBeDefined();
      repo.update(created.id, {
        title: "Pickup",
        start: at(10),
        end: at(10, 10),
        requiresHandoff: false,
      });
      expect(obligation(created.id)).toBeUndefined();
    });

    it("keeps a claimed obligation when requiresHandoff turns off", () => {
      const created = repo.create({
        title: "Pickup",
        start: at(10),
        end: at(10, 10),
        requiresHandoff: true,
      });
      db.prepare(`UPDATE handoff_obligations SET status = 'claimed' WHERE event_id = ?`).run(
        created.id,
      );
      repo.update(created.id, {
        title: "Pickup",
        start: at(10),
        end: at(10, 10),
        requiresHandoff: false,
      });
      const row = obligation(created.id);
      expect(row).toBeDefined();
      expect(row!.status).toBe("claimed");
    });
  });
});
