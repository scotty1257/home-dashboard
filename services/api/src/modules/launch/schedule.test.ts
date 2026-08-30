import { describe, expect, it } from "vitest";
import type { LaunchStep, LaunchTemplate } from "@home-dashboard/contracts";
import {
  buildDepartureAt,
  deriveStatus,
  localServiceDate,
  resolveActiveTemplate,
  shouldChime,
  weekdayOfServiceDate,
} from "./schedule.js";

/**
 * Pure scheduling math for launch runs. Every expectation here was verified
 * against the real @date-fns/tz-backed zonedTimeToUtc (2026 US spring forward
 * is March 8; New York is EST -5 through March 7 and EDT -4 from March 8).
 */

const CREATED = "2026-01-01T00:00:00.000Z";

function makeTemplate(overrides: Partial<LaunchTemplate> = {}): LaunchTemplate {
  return {
    id: "launch-weekday",
    childId: "member-kid",
    name: "Weekday launch",
    weekdays: [1, 2, 3, 4, 5],
    departureLocalTime: "08:00",
    activeWindowMinutes: 45,
    chimeBeforeMinutes: 3,
    active: true,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function makeStep(overrides: Partial<LaunchStep> = {}): LaunchStep {
  return {
    id: "launch-step-shoes",
    templateId: "launch-weekday",
    label: "Shoes",
    icon: "shoes",
    sortOrder: 0,
    active: true,
    ...overrides,
  };
}

/** Departure 08:00Z on Monday 2026-03-09 (UTC), the anchor run. */
const DEPARTURE = "2026-03-09T08:00:00.000Z";
const at = (iso: string): Date => new Date(iso);

describe("launch schedule", () => {
  it("1. resolves the active template by weekday, earliest createdAt wins", () => {
    const template = makeTemplate();
    // Saturday (6) and Sunday (0) are outside the [1..5] weekday set.
    expect(resolveActiveTemplate([template], 6)).toBeNull();
    expect(resolveActiveTemplate([template], 0)).toBeNull();
    // Monday (1) matches.
    expect(resolveActiveTemplate([template], 1)?.id).toBe("launch-weekday");

    // Inactive templates never own a date, even on a matching weekday.
    expect(resolveActiveTemplate([makeTemplate({ active: false })], 1)).toBeNull();

    // Multiple active matches → first by createdAt.
    const earlier = makeTemplate({ id: "earlier", createdAt: "2025-12-01T00:00:00.000Z" });
    const later = makeTemplate({ id: "later", createdAt: "2026-02-01T00:00:00.000Z" });
    expect(resolveActiveTemplate([later, earlier], 1)?.id).toBe("earlier");
  });

  it("2. builds DST-correct departure instants for America/New_York", () => {
    // Saturday 2026-03-07 08:00 is still EST (-5) → 13:00 UTC.
    expect(buildDepartureAt("08:00", "2026-03-07", "America/New_York")).toBe(
      "2026-03-07T13:00:00.000Z",
    );
    // Monday 2026-03-09 08:00 is EDT (-4, after the March 8 spring forward) → 12:00 UTC.
    expect(buildDepartureAt("08:00", "2026-03-09", "America/New_York")).toBe(
      "2026-03-09T12:00:00.000Z",
    );
    // Same wall clock, one hour of absolute time apart across the boundary.
    // UTC stays identity.
    expect(buildDepartureAt("08:00", "2026-03-09", "UTC")).toBe("2026-03-09T08:00:00.000Z");
  });

  it("3. derives run status with the 15-minute grace boundary", () => {
    const steps = [
      makeStep(),
      makeStep({ id: "launch-step-bag", label: "Bag", icon: "bag", sortOrder: 1 }),
      makeStep({ id: "launch-step-snack", label: "Snack", icon: "snack", sortOrder: 2 }),
    ];
    const run = { departureAt: DEPARTURE };

    // Active well inside the window and one millisecond before grace end.
    expect(deriveStatus(run, steps, [], at("2026-03-09T07:15:00.000Z"))).toBe("active");
    expect(deriveStatus(run, steps, [], at("2026-03-09T08:14:59.999Z"))).toBe("active");
    // Exactly at departure + 15 minutes → expired.
    expect(deriveStatus(run, steps, [], at("2026-03-09T08:15:00.000Z"))).toBe("expired");
    expect(deriveStatus(run, steps, [], at("2026-03-09T09:00:00.000Z"))).toBe("expired");

    // All active steps completed → complete, inside the window and even past grace.
    const all = steps.map((s) => s.id);
    expect(deriveStatus(run, steps, all, at("2026-03-09T08:01:00.000Z"))).toBe("complete");
    expect(deriveStatus(run, steps, all, at("2026-03-09T08:30:00.000Z"))).toBe("complete");

    // Inactive steps never gate completion: the caller passes only the active
    // steps (the repository filters), so completing those is enough.
    expect(deriveStatus(run, [steps[0]!], [steps[0]!.id], at("2026-03-09T08:01:00.000Z"))).toBe(
      "complete",
    );
    expect(deriveStatus(run, [steps[0]!], [], at("2026-03-09T08:01:00.000Z"))).toBe("active");
  });

  it("4. fires the chime exactly inside the lead-up window", () => {
    const template = makeTemplate({ chimeBeforeMinutes: 3 });
    const active = { departureAt: DEPARTURE, status: "active" as const, chimePlayedAt: null };

    // Exactly at departure - 3 minutes → true (>= threshold), and onward.
    expect(shouldChime(active, template, at("2026-03-09T07:57:00.000Z"))).toBe(true);
    expect(shouldChime(active, template, at("2026-03-09T07:58:00.000Z"))).toBe(true);
    // 30 minutes out is still before the 3-minute lead-up → false.
    expect(shouldChime(active, template, at("2026-03-09T07:30:00.000Z"))).toBe(false);
    // One millisecond early → false.
    expect(shouldChime(active, template, at("2026-03-09T07:56:59.999Z"))).toBe(false);
    // Acknowledged or no longer active → false.
    expect(
      shouldChime({ ...active, chimePlayedAt: "2026-03-09T07:57:00.000Z" }, template, at(
        "2026-03-09T07:58:00.000Z",
      )),
    ).toBe(false);
    expect(
      shouldChime({ ...active, status: "complete" as const }, template, at("2026-03-09T07:57:00.000Z")),
    ).toBe(false);
    expect(
      shouldChime({ ...active, status: "expired" as const }, template, at("2026-03-09T07:57:00.000Z")),
    ).toBe(false);
  });

  it("5. maps instants to local service dates and weekdays", () => {
    // Near-midnight UTC is still the previous calendar day in New York.
    expect(localServiceDate(at("2026-08-30T23:30:00.000Z"), "America/New_York")).toBe("2026-08-30");
    expect(localServiceDate(at("2026-08-31T02:00:00.000Z"), "UTC")).toBe("2026-08-31");
    // Calendar dates carry a timezone-independent weekday.
    expect(weekdayOfServiceDate("2026-03-09")).toBe(1); // Monday
    expect(weekdayOfServiceDate("2026-03-14")).toBe(6); // Saturday
    expect(weekdayOfServiceDate("2026-03-08")).toBe(0); // Sunday
  });
});
