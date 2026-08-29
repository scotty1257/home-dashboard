import { beforeEach, describe, expect, it } from "vitest";
import type { DashboardSettingsPatch } from "@home-dashboard/contracts";
import { Database } from "../../platform/database.js";
import { eventHub } from "../../platform/events.js";
import { FixedClock } from "../../test/testClock.js";
import { ConflictError } from "../handoffs/repository.js";
import { HouseholdRepository } from "../household/repository.js";
import { RoleError } from "../household/repository.js";
import { SettingsStore } from "../settings/routes.js";
import { DutyRepository } from "./repository.js";

/** Seeded members: You/Partner are adults, Kid is a child. */
const YOU = "member-you";
const PARTNER = "member-partner";
const KID = "member-kid";

/** Anchor instant: 2030-01-01T12:00:00.000Z. */
const BASE = "2030-01-01T12:00:00.000Z";
const DAY_MS = 86_400_000;

/** ISO instant `minutes` after BASE, so expected occurredAt values read clearly. */
function at(minutes: number): string {
  return new Date(new Date(BASE).getTime() + minutes * 60_000).toISOString();
}

let db: Database;
let household: HouseholdRepository;
let settings: SettingsStore;
let clock: FixedClock;
let repo: DutyRepository;

beforeEach(() => {
  db = new Database(":memory:");
  household = new HouseholdRepository(db);
  settings = new SettingsStore(db);
  clock = new FixedClock(BASE);
  repo = new DutyRepository(db, household, settings, clock);
});

describe("duty repository", () => {
  it("1. tallies per-adult counts for Bedtime inside the window", () => {
    for (let i = 0; i < 3; i++) {
      clock.advanceMs(60_000);
      repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU });
    }
    for (let i = 0; i < 5; i++) {
      clock.advanceMs(60_000);
      repo.logEntry({ dutyId: "duty-bedtime", performedBy: PARTNER });
    }

    const summary = repo.summary(30);
    const bedtime = summary.duties.find((d) => d.dutyId === "duty-bedtime")!;
    expect(bedtime).toBeDefined();
    const byMember = new Map(bedtime.counts.map((c) => [c.memberId, c.count]));
    expect(byMember.get(YOU)).toBe(3);
    expect(byMember.get(PARTNER)).toBe(5);
    // The kid never appears: child credit is rejected at write time.
    expect([...byMember.keys()]).not.toContain(KID);
  });

  it("2. computes the streak by occurredAt, not insertion order", () => {
    // Scrambled insertion order: the streak only comes out right when entries
    // are sorted newest-first by occurredAt (ties by created_at).
    clock.advanceMs(50 * 60_000); // T+50m
    repo.logEntry({ dutyId: "duty-school-run", performedBy: PARTNER });
    clock.advanceMs(-40 * 60_000); // T+10m
    repo.logEntry({ dutyId: "duty-school-run", performedBy: YOU });
    clock.advanceMs(30 * 60_000); // T+40m
    repo.logEntry({ dutyId: "duty-school-run", performedBy: PARTNER });
    clock.advanceMs(-10 * 60_000); // T+30m
    repo.logEntry({ dutyId: "duty-school-run", performedBy: PARTNER });
    clock.advanceMs(-10 * 60_000); // T+20m
    repo.logEntry({ dutyId: "duty-school-run", performedBy: PARTNER });
    // Back-dated inserts live "in the future" of the fixed clock — move past
    // them so the summary window actually covers every entry.
    clock.advanceMs(40 * 60_000); // T+60m

    const summary = repo.summary(30);
    const school = summary.duties.find((d) => d.dutyId === "duty-school-run")!;
    // Newest four entries (T+50…T+20) are all Partner's.
    expect(school.streak).toEqual({ memberId: PARTNER, displayName: "Partner", count: 4 });
    expect(school.mostRecentMemberId).toBe(PARTNER);
    expect(school.mostRecentAt).toBe(at(50));
  });

  it("3. keeps a duty in the summary when its streak is below 3", () => {
    clock.advanceMs(60_000);
    repo.logEntry({ dutyId: "duty-dentist-booking", performedBy: YOU });
    clock.advanceMs(60_000);
    repo.logEntry({ dutyId: "duty-dentist-booking", performedBy: YOU });

    const summary = repo.summary(30);
    const dentist = summary.duties.find((d) => d.dutyId === "duty-dentist-booking")!;
    expect(dentist).toBeDefined();
    // The streak object is returned (count >= 1); the UI hides it below 3.
    expect(dentist.streak).toEqual({ memberId: YOU, displayName: "You", count: 2 });
  });

  it("4. carries the exact clock timestamps through recentEntries, newest first", () => {
    repo.logEntry({ dutyId: "duty-dentist-booking", performedBy: YOU }); // T
    clock.advanceMs(2 * 3_600_000);
    repo.logEntry({ dutyId: "duty-permission-slip", performedBy: PARTNER }); // T+2h
    clock.advanceMs(3 * 60_000);
    repo.logEntry({ dutyId: "duty-night-wake", performedBy: YOU, note: "rough night" }); // T+2h3m

    const summary = repo.summary(30);
    expect(summary.recentEntries).toHaveLength(3);
    const [first, second, third] = summary.recentEntries;
    expect(first!.dutyName).toBe("Night wake-up");
    expect(first!.occurredAt).toBe(at(123));
    expect(first!.performerName).toBe("You");
    expect(first!.note).toBe("rough night");
    expect(second!.dutyName).toBe("Permission slip");
    expect(second!.occurredAt).toBe(at(120));
    expect(second!.performerName).toBe("Partner");
    expect(third!.dutyName).toBe("Dentist booking");
    expect(third!.occurredAt).toBe(at(0));
    expect(third!.performerName).toBe("You");
  });

  it("5. rejects a child performer with RoleError and stamps server time on adult entries", () => {
    const received: string[] = [];
    const unsubscribe = eventHub.subscribe((event) => received.push(event.type));

    expect(() => repo.logEntry({ dutyId: "duty-bedtime", performedBy: KID })).toThrow(RoleError);

    const entry = repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU });
    expect(entry.performedBy).toBe(YOU);
    // Server-side occurredAt, not client-supplied.
    expect(entry.occurredAt).toBe(clock.nowIso());
    expect(entry.dutyName).toBe("Bedtime");
    expect(entry.performerName).toBe("You");

    unsubscribe();
    expect(received).toContain("duty:changed");
  });

  it("6. undoes only the latest entry of a duty, adults only", () => {
    clock.advanceMs(60_000);
    const older = repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU });
    clock.advanceMs(60_000);
    const latest = repo.logEntry({ dutyId: "duty-bedtime", performedBy: PARTNER });

    // Not the latest entry of the duty → conflict.
    expect(() => repo.undoEntry(older.id, YOU)).toThrow(ConflictError);
    // Child actors may never undo.
    expect(() => repo.undoEntry(latest.id, KID)).toThrow(RoleError);

    const removed = repo.undoEntry(latest.id, YOU)!;
    expect(removed.id).toBe(latest.id);
    const after = repo.summary(30);
    expect(after.recentEntries.map((e) => e.id)).not.toContain(latest.id);

    // With the newer row gone, the older entry is now the latest — deletable.
    expect(() => repo.undoEntry(older.id, YOU)).not.toThrow();
    expect(repo.undoEntry("does-not-exist", YOU)).toBeUndefined();
  });

  it("7. narrows counts by window without mutating stored entries", () => {
    repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU }); // now
    clock.advanceMs(10 * DAY_MS);
    repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU }); // +10d
    clock.advanceMs(10 * DAY_MS);
    repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU }); // +20d

    const inSeven = repo.summary(7);
    const bedtimeSeven = inSeven.duties.find((d) => d.dutyId === "duty-bedtime")!;
    expect(bedtimeSeven.counts).toEqual([{ memberId: YOU, displayName: "You", count: 1 }]);

    const inThirty = repo.summary(30);
    const bedtimeThirty = inThirty.duties.find((d) => d.dutyId === "duty-bedtime")!;
    expect(bedtimeThirty.counts).toEqual([{ memberId: YOU, displayName: "You", count: 3 }]);

    // recentEntries are the last entries overall: identical across windows.
    expect(inSeven.recentEntries.map((e) => e.occurredAt)).toEqual(
      inThirty.recentEntries.map((e) => e.occurredAt),
    );

    // The stored rows keep their original timestamps — reads never mutate.
    const rows = db
      .prepare(`SELECT occurred_at FROM duty_entries ORDER BY occurred_at DESC`)
      .all() as unknown as { occurred_at: string }[];
    expect(rows.map((r) => r.occurred_at)).toEqual([at(20 * 24 * 60), at(10 * 24 * 60), at(0)]);
  });

  it("8. defaults the window to settings.family.dutyWindowDays", () => {
    const patch: DashboardSettingsPatch = {
      family: {
        handoffAlertTime: "18:00",
        travelBufferMinutes: 15,
        overrunBufferMinutes: 15,
        dutyWindowDays: 7,
      },
    };
    settings.set(patch);

    repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU }); // now
    clock.advanceMs(10 * DAY_MS);
    repo.logEntry({ dutyId: "duty-bedtime", performedBy: YOU }); // +10d

    // The settings default (7 days) hides the ten-day-old entry…
    const fromSettings = repo.summary();
    const bedtimeSettings = fromSettings.duties.find((d) => d.dutyId === "duty-bedtime")!;
    expect(bedtimeSettings.counts).toEqual([{ memberId: YOU, displayName: "You", count: 1 }]);
    expect(fromSettings.windowEnd).toBe(clock.nowIso());

    // …while an explicit parameter still widens it.
    const explicit = repo.summary(30);
    const bedtimeExplicit = explicit.duties.find((d) => d.dutyId === "duty-bedtime")!;
    expect(bedtimeExplicit.counts).toEqual([{ memberId: YOU, displayName: "You", count: 2 }]);
  });

  it("9. manages duty definitions, adults only", () => {
    expect(repo.listDefinitions().map((d) => d.name)).toContain("Bedtime");

    const created = repo.createDefinition(
      { name: "Trash", icon: "trash", color: "slate", sortOrder: 5, active: true },
      YOU,
    );
    expect(created.name).toBe("Trash");
    expect(created.active).toBe(true);

    expect(() =>
      repo.createDefinition({ name: "Dishes", icon: "dishes", color: "teal", sortOrder: 6, active: true }, KID),
    ).toThrow(RoleError);

    const updated = repo.updateDefinition(
      created.id,
      { name: "Trash night", icon: "trash", color: "slate", sortOrder: 5, active: false },
      PARTNER,
    )!;
    expect(updated.name).toBe("Trash night");
    expect(updated.active).toBe(false);

    // Inactive duties drop off the summary board but stay queryable.
    const summary = repo.summary(30);
    expect(summary.duties.find((d) => d.dutyId === created.id)).toBeUndefined();
    expect(repo.listDefinitions().map((d) => d.id)).toContain(created.id);

    expect(repo.updateDefinition("does-not-exist", { name: "X", icon: "custom", color: "sky", sortOrder: 0, active: true }, YOU)).toBeUndefined();
  });
});
