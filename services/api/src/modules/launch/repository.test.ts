import { beforeEach, describe, expect, it } from "vitest";
import type { LaunchTemplateInput } from "@home-dashboard/contracts";
import { Database } from "../../platform/database.js";
import { eventHub } from "../../platform/events.js";
import { FixedClock } from "../../test/testClock.js";
import { ConflictError } from "../handoffs/repository.js";
import { HouseholdRepository, RoleError } from "../household/repository.js";
import { SettingsStore } from "../settings/routes.js";
import { LaunchRepository, NotFoundError } from "./repository.js";

/**
 * Launch persistence against the seeded schema (Task 4): the 'launch-weekday'
 * template runs Monday–Friday at 08:00 for member-kid with Shoes/Bag/Snack
 * steps. Zone defaults to UTC via settings; one case pins America/New_York
 * across the 2026 spring-forward (Mar 8).
 */

/** Seeded members: You/Partner are adults, Kid is a child. */
const YOU = "member-you";
const PARTNER = "member-partner";
const KID = "member-kid";

/** Monday 2026-03-09, 06:30 UTC — inside the seeded template's window (UTC zone). */
const BASE = "2026-03-09T06:30:00.000Z";
/** Seeded departure: 08:00 UTC on the Monday service date. */
const DEPARTURE = "2026-03-09T08:00:00.000Z";
/** Saturday of the same week: the weekday template does not own it. */
const SATURDAY = "2026-03-14T10:00:00.000Z";

const STEP_IDS = ["launch-step-shoes", "launch-step-bag", "launch-step-snack"] as const;

function templateInput(overrides: Partial<LaunchTemplateInput> = {}): LaunchTemplateInput {
  return {
    childId: KID,
    name: "Weekday launch",
    weekdays: [1, 2, 3, 4, 5],
    departureLocalTime: "08:00",
    activeWindowMinutes: 45,
    chimeBeforeMinutes: 3,
    active: true,
    ...overrides,
  };
}

function runCount(db: Database): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM launch_runs`).get() as { n: number }).n;
}

let db: Database;
let household: HouseholdRepository;
let settings: SettingsStore;
let clock: FixedClock;
let repo: LaunchRepository;

beforeEach(() => {
  db = new Database(":memory:");
  household = new HouseholdRepository(db);
  settings = new SettingsStore(db);
  clock = new FixedClock(BASE);
  repo = new LaunchRepository(db, household, settings, clock);
});

describe("launch repository", () => {
  it("1. creates exactly one run per service date and none on unmatched weekdays", () => {
    const first = repo.current();
    expect(first.nowIso).toBe(clock.nowIso());
    expect(first.template?.id).toBe("launch-weekday");
    expect(first.run).not.toBeNull();
    expect(first.run!.serviceDate).toBe("2026-03-09");
    expect(first.run!.departureAt).toBe(DEPARTURE);
    expect(first.run!.status).toBe("active");
    expect(first.run!.completedStepIds).toEqual([]);
    expect(first.run!.completedAt).toBeNull();
    expect(first.run!.chimePlayedAt).toBeNull();
    expect(first.steps.map((s) => s.label)).toEqual(["Shoes", "Bag", "Snack"]);
    expect(first.steps.map((s) => s.id)).toEqual([...STEP_IDS]);

    // Second call on the same date: find-or-create resolves to the same run.
    const second = repo.current();
    expect(second.run!.id).toBe(first.run!.id);
    expect(runCount(db)).toBe(1);

    // Saturday: no active template owns the weekday → empty state, no run row.
    clock.advanceTo(SATURDAY);
    const none = repo.current();
    expect(none.run).toBeNull();
    expect(none.template).toBeNull();
    expect(none.steps).toEqual([]);
    expect(runCount(db)).toBe(1);
  });

  it("2. toggles steps to complete, undoes back to active, and completes again", () => {
    const runId = repo.current().run!.id;

    let view = repo.toggleStep(runId, "launch-step-shoes", YOU);
    expect(view.status).toBe("active");
    expect(view.completedStepIds).toEqual(["launch-step-shoes"]);

    clock.advanceMs(60_000);
    view = repo.toggleStep(runId, "launch-step-bag", PARTNER);
    expect(view.status).toBe("active");
    expect(view.completedStepIds).toEqual(["launch-step-shoes", "launch-step-bag"]);

    clock.advanceMs(60_000);
    const doneAt = clock.nowIso();
    view = repo.toggleStep(runId, "launch-step-snack", YOU);
    expect(view.status).toBe("complete");
    expect(view.completedAt).toBe(doneAt);
    expect(view.completedStepIds).toEqual([...STEP_IDS]);
    // Persisted, and visible through the read path.
    const row = db
      .prepare(`SELECT status, completed_at FROM launch_runs WHERE id = ?`)
      .get(runId) as { status: string; completed_at: string | null };
    expect(row.status).toBe("complete");
    expect(row.completed_at).toBe(doneAt);
    const completeNow = repo.current();
    expect(completeNow.run!.status).toBe("complete");
    expect(completeNow.run!.completedAt).toBe(doneAt);

    // Undo one step: the run reopens, completedAt clears.
    clock.advanceMs(60_000);
    view = repo.toggleStep(runId, "launch-step-snack", YOU);
    expect(view.status).toBe("active");
    expect(view.completedAt).toBeNull();
    expect(view.completedStepIds).toEqual(["launch-step-shoes", "launch-step-bag"]);
    const afterUndo = repo.current();
    expect(afterUndo.run!.status).toBe("active");
    expect(afterUndo.run!.completedAt).toBeNull();

    // The cycle closes: completing the step again finishes the run.
    view = repo.toggleStep(runId, "launch-step-snack", PARTNER);
    expect(view.status).toBe("complete");
    expect(view.completedAt).toBe(clock.nowIso());
  });

  it("3. acknowledges the departure chime exactly once", () => {
    const runId = repo.current().run!.id;
    clock.advanceTo("2026-03-09T07:57:00.000Z"); // exactly the chime threshold
    const ackAt = clock.nowIso();

    const view = repo.markChimePlayed(runId);
    expect(view.chimePlayedAt).toBe(ackAt);
    expect(repo.current().run!.chimePlayedAt).toBe(ackAt);

    expect(() => repo.markChimePlayed(runId)).toThrow(ConflictError);
    expect(() => repo.markChimePlayed("no-such-run")).toThrow(NotFoundError);
  });

  it("4. resets a run completely, adults only", () => {
    const runId = repo.current().run!.id;
    for (const stepId of STEP_IDS) repo.toggleStep(runId, stepId, YOU);
    repo.markChimePlayed(runId);
    expect(repo.current().run!.status).toBe("complete");

    expect(() => repo.reset(runId, KID)).toThrow(RoleError);

    const view = repo.reset(runId, PARTNER);
    expect(view.completedStepIds).toEqual([]);
    expect(view.chimePlayedAt).toBeNull();
    expect(view.completedAt).toBeNull();
    expect(view.status).toBe("active");

    const row = db
      .prepare(`SELECT status, chime_played_at, completed_at FROM launch_runs WHERE id = ?`)
      .get(runId) as { status: string; chime_played_at: string | null; completed_at: string | null };
    expect(row.status).toBe("active");
    expect(row.chime_played_at).toBeNull();
    expect(row.completed_at).toBeNull();
    const completions = db
      .prepare(`SELECT COUNT(*) AS n FROM launch_step_completions WHERE run_id = ?`)
      .get(runId) as { n: number };
    expect(completions.n).toBe(0);

    expect(() => repo.reset("no-such-run", YOU)).toThrow(NotFoundError);
  });

  it("5. rejects child actors, unknown runs/steps, and foreign-template steps", () => {
    const runId = repo.current().run!.id;

    expect(() => repo.toggleStep(runId, "launch-step-shoes", KID)).toThrow(RoleError);
    expect(() => repo.toggleStep("no-such-run", "launch-step-shoes", YOU)).toThrow(NotFoundError);
    expect(() => repo.toggleStep(runId, "no-such-step", YOU)).toThrow(NotFoundError);

    // A step belonging to another template is not part of this run.
    const other = repo.createTemplate(
      {
        ...templateInput({ name: "Weekend launch", weekdays: [0, 6], departureLocalTime: "09:00" }),
        steps: [{ label: "Water bottle", icon: "water", sortOrder: 0 }],
      },
      YOU,
    );
    expect(() => repo.toggleStep(runId, other.steps[0]!.id, YOU)).toThrow(NotFoundError);
  });

  it("6. propagates template departure edits into the next current() call", () => {
    const before = repo.current();
    expect(before.run!.departureAt).toBe(DEPARTURE);

    repo.updateTemplate("launch-weekday", templateInput({ departureLocalTime: "08:30" }), YOU);

    const after = repo.current();
    expect(after.run!.id).toBe(before.run!.id); // same run row for the date
    expect(after.run!.departureAt).toBe("2026-03-09T08:30:00.000Z");
    const row = db
      .prepare(`SELECT departure_at FROM launch_runs WHERE id = ?`)
      .get(after.run!.id) as { departure_at: string };
    expect(row.departure_at).toBe("2026-03-09T08:30:00.000Z");
  });

  it("7. manages templates (list/create/update), adults only, replacing steps on demand", () => {
    const listed = repo.listTemplates();
    const seeded = listed.find((t) => t.id === "launch-weekday")!;
    expect(seeded.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(seeded.departureLocalTime).toBe("08:00");
    expect(seeded.steps.map((s) => s.label)).toEqual(["Shoes", "Bag", "Snack"]);

    expect(() => repo.createTemplate(templateInput(), KID)).toThrow(RoleError);

    const created = repo.createTemplate(
      {
        ...templateInput({ name: "Weekend launch", weekdays: [0, 6], departureLocalTime: "09:30" }),
        steps: [
          { label: "Water bottle", icon: "water", sortOrder: 0 },
          { label: "Jacket", icon: "jacket", sortOrder: 1, active: false },
        ],
      },
      YOU,
    );
    expect(created.name).toBe("Weekend launch");
    expect(created.steps.map((s) => s.label)).toEqual(["Water bottle", "Jacket"]);
    expect(created.steps[1]!.active).toBe(false);

    // Defaults apply when the optional knobs are omitted.
    const bare = repo.createTemplate(
      { childId: KID, name: "Bare", weekdays: [3], departureLocalTime: "10:00", active: true },
      PARTNER,
    );
    expect(bare.activeWindowMinutes).toBe(45);
    expect(bare.chimeBeforeMinutes).toBe(3);
    expect(bare.steps).toEqual([]);

    // Steps are replaced wholesale when provided…
    const replaced = repo.updateTemplate(
      created.id,
      {
        ...templateInput({ name: "Weekend launch", weekdays: [0, 6], departureLocalTime: "09:30" }),
        steps: [{ label: "Snack", icon: "snack", sortOrder: 0 }],
      },
      YOU,
    )!;
    expect(replaced.steps.map((s) => s.label)).toEqual(["Snack"]);

    // …and preserved when omitted.
    const kept = repo.updateTemplate(
      "launch-weekday",
      templateInput({ name: "Weekday launch (edited)" }),
      PARTNER,
    )!;
    expect(kept.steps.map((s) => s.label)).toEqual(["Shoes", "Bag", "Snack"]);
    expect(kept.name).toBe("Weekday launch (edited)");

    expect(() => repo.updateTemplate("no-such-template", templateInput(), YOU)).toThrow(NotFoundError);
    expect(() => repo.updateTemplate("launch-weekday", templateInput(), KID)).toThrow(RoleError);
  });

  it("8. emits launch:changed for every mutation", () => {
    const received: string[] = [];
    const unsubscribe = eventHub.subscribe((event) => received.push(event.type));

    const runId = repo.current().run!.id;
    repo.toggleStep(runId, "launch-step-shoes", YOU);
    repo.markChimePlayed(runId);
    repo.reset(runId, YOU);
    repo.createTemplate(templateInput({ name: "Spare" }), YOU);
    repo.updateTemplate("launch-weekday", templateInput(), YOU);

    unsubscribe();
    expect(received.filter((type) => type === "launch:changed").length).toBe(5);
  });

  it("9. honors the household timezone across the 2026 spring-forward", () => {
    settings.set({ timezone: "America/New_York" });

    // Monday 2026-03-09 07:30 in New York (EDT -4): local date still the 9th.
    clock.advanceTo("2026-03-09T11:30:00.000Z");
    const monday = repo.current();
    expect(monday.run!.serviceDate).toBe("2026-03-09");
    // 08:00 local EDT = 12:00 UTC — an hour earlier than the EST equivalent.
    expect(monday.run!.departureAt).toBe("2026-03-09T12:00:00.000Z");

    // 2026-03-09 02:00 UTC is Sunday evening 2026-03-08 in New York: the
    // weekday template does not own Sundays, so no run exists yet.
    clock.advanceTo("2026-03-09T02:00:00.000Z");
    const sunday = repo.current();
    expect(sunday.run).toBeNull();
    expect(sunday.template).toBeNull();

    // Saturday 07:30 EST (12:30 UTC): also unmatched.
    clock.advanceTo("2026-03-07T12:30:00.000Z");
    expect(repo.current().run).toBeNull();
  });
});
