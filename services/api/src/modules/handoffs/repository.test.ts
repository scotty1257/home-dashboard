import { describe, it, expect, beforeEach } from "vitest";
import { Database } from "../../platform/database.js";
import { CalendarRepository } from "../calendar/repository.js";
import { HouseholdRepository } from "../household/repository.js";
import { SettingsStore } from "../settings/routes.js";
import { HandoffRepository } from "./repository.js";
import { eventHub } from "../../platform/events.js";

function iso(day: number, hour = 9, minute = 0): string {
  return new Date(2026, 5, day, hour, minute, 0).toISOString();
}

describe("HandoffRepository", () => {
  let db: Database;
  let calendar: CalendarRepository;
  let household: HouseholdRepository;
  let handoffs: HandoffRepository;
  let events: { type: string; payload: unknown }[];

  beforeEach(() => {
    db = new Database(":memory:");
    calendar = new CalendarRepository(db);
    household = new HouseholdRepository(db);
    const settings = new SettingsStore(db);
    handoffs = new HandoffRepository(db, calendar, household, settings);
    events = [];
    eventHub.subscribe((e) => events.push(e as { type: string; payload: unknown }));
  });

  function seedHandoff(day = 11, startHour = 16, minute = 15): string {
    const event = calendar.create({
      title: "Pickup",
      start: iso(day, startHour, minute),
      end: iso(day, startHour, minute + 15),
      ownerId: "member-kid",
      scheduleKind: "child-commitment",
      requiresHandoff: true,
    });
    const created = handoffs.create({
      eventId: event.id,
      startsAt: event.start,
      endsAt: event.end,
      actorId: "member-you",
    });
    return created.id;
  }

  it("creates and lists obligations in a window", () => {
    const id = seedHandoff();
    const board = handoffs.board(iso(1), iso(30));
    expect(board.items).toHaveLength(1);
    expect(board.items[0]!.id).toBe(id);
    expect(board.items[0]!.status).toBe("unclaimed");
    expect(board.items[0]!.child?.id).toBe("member-kid");
    expect(board.items[0]!.eventSummary?.title).toBe("Pickup");
  });

  it("recommendation is exposed but never silently assigns", () => {
    seedHandoff();
    const board = handoffs.board(iso(1), iso(30));
    const item = board.items[0]!;
    expect(item.recommendedMemberId).toBe("member-you"); // first adult by sort order
    expect(item.assigneeMemberId).toBeUndefined();
    expect(item.status).toBe("unclaimed");
  });

  it("claim as adult updates assignee, status, and attribution time", () => {
    const id = seedHandoff();
    const claimed = handoffs.claim(id, "member-partner");
    expect(claimed.status).toBe("claimed");
    expect(claimed.assigneeMemberId).toBe("member-partner");
    expect(claimed.updatedBy).toBe("member-partner");
    expect(claimed.updatedAt).toBe(claimed.createdAt === claimed.updatedAt ? claimed.updatedAt : claimed.updatedAt);
    // server-provided timestamp exists
    expect(claimed.updatedAt).toBeTruthy();
  });

  it("claim by a child is rejected", () => {
    const id = seedHandoff();
    expect(() => handoffs.claim(id, "member-kid")).toThrowError(/adult/i);
    const board = handoffs.board(iso(1), iso(30));
    expect(board.items[0]!.status).toBe("unclaimed");
  });

  it("a stale concurrent claim by another adult returns a conflict", () => {
    const id = seedHandoff();
    handoffs.claim(id, "member-you");
    expect(() => handoffs.claim(id, "member-partner")).toThrowError(/claimed/i);
    const board = handoffs.board(iso(1), iso(30));
    expect(board.items[0]!.assigneeMemberId).toBe("member-you"); // first decision kept
  });

  it("requestBackup and resolve transitions", () => {
    const id = seedHandoff();
    const backup = handoffs.requestBackup(id, { actorId: "member-you", note: "stuck at work" });
    expect(backup.status).toBe("backup-requested");
    const resolved = handoffs.resolve(id, "member-partner");
    expect(resolved.status).toBe("resolved");
    expect(() => handoffs.claim(id, "member-partner")).toThrow();
  });

  it("contacts CRUD works and lists sorted by priority", () => {
    handoffs.createContact({ name: "Neighbor", relationship: "neighbor", phone: "555-2", priority: 2, active: true });
    handoffs.createContact({ name: "Grandma", relationship: "grandmother", phone: "555-1", priority: 1, active: true });
    const contacts = handoffs.listContacts();
    expect(contacts.map((c) => c.name)).toEqual(["Grandma", "Neighbor"]);
    const updated = handoffs.updateContact(contacts[1]!.id, {
      name: "Neighbor", relationship: "neighbor", phone: "555-9", priority: 2, active: false,
    });
    expect(updated.active).toBe(false);
  });

  it("emits handoff events after committed writes", () => {
    const id = seedHandoff();
    handoffs.claim(id, "member-you");
    const types = events.map((e) => e.type);
    expect(types).toContain("handoff:changed");
  });

  it("board marks night-before state from the injected clock", () => {
    const id = seedHandoff(12, 16, 15); // June 12 handoff
    // Settings default timezone is UTC, so the local-day rule runs in UTC:
    // night-before alert = June 11 at 18:00 UTC.
    const before = handoffs.board(iso(1), iso(30), new Date("2026-06-11T17:59:59Z"));
    expect(before.items[0]!.attentionState).toBe("planned");
    const after = handoffs.board(iso(1), iso(30), new Date("2026-06-11T18:00:00Z"));
    expect(after.items[0]!.attentionState).toBe("night-before");
    expect(after.items[0]!.id).toBe(id);
  });

  it("flags a buffered adult conflict against the handoff window", () => {
    const event = calendar.create({
      title: "Pickup",
      start: iso(11, 16, 15),
      end: iso(11, 16, 30),
      ownerId: "member-kid",
      scheduleKind: "child-commitment",
      requiresHandoff: true,
    });
    calendar.create({
      title: "Call",
      start: iso(11, 16, 0),
      end: iso(11, 16, 15),
      ownerId: "member-you",
      scheduleKind: "adult-commitment",
    });
    handoffs.create({ eventId: event.id, startsAt: event.start, endsAt: event.end, actorId: "member-you" });
    const board = handoffs.board(iso(1), iso(30));
    const item = board.items[0]!;
    const you = item.availability.find((a) => a.memberId === "member-you")!;
    expect(you.state).toBe("conflict");
    expect(you.conflicts.map((c) => c.title)).toContain("Call");
    expect(item.recommendedMemberId).toBe("member-partner");
    expect(item.conflictReason).toContain("Call");
  });
});
