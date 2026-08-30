import type { LaunchStep, LaunchTemplate } from "@home-dashboard/contracts";
import { localDateKey, zonedTimeToUtc } from "../handoffs/conflicts.js";

const MINUTE_MS = 60_000;

/**
 * Minutes after departureAt at which an unfinished run lapses to 'expired'.
 * Fixed by the product spec (the schema has no per-template grace knob).
 */
export const EXPIRY_GRACE_MINUTES = 15;

/** The minimal run shape the pure helpers reason over. */
export interface RunLike {
  departureAt: string;
  chimePlayedAt?: string | null;
}

/** A run plus the status derived for it at some instant. */
export interface StatusRun extends RunLike {
  status: "active" | "complete" | "expired";
}

/**
 * Weekday (0 = Sunday … 6 = Saturday) of a YYYY-MM-DD service date. A calendar
 * date has one weekday regardless of zone, so plain UTC components suffice.
 */
export function weekdayOfServiceDate(serviceDate: string): number {
  const [y, m, d] = serviceDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The template that owns a service date: active, weekday set contains the
 * weekday, earliest createdAt breaks ties.
 */
export function resolveActiveTemplate(
  templates: LaunchTemplate[],
  weekday: number,
): LaunchTemplate | null {
  const matches = templates.filter((t) => t.active && t.weekdays.includes(weekday));
  matches.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return matches[0] ?? null;
}

/**
 * Departure instant (UTC ISO) for a wall-clock HH:mm on a YYYY-MM-DD service
 * date in an IANA zone. DST-aware via the shared two-pass zonedTimeToUtc:
 * non-existent/ambiguous local times land on the shifted offset, which is the
 * documented choice for wall-clock schedules (a launch happens every weekday
 * at 08:00 local, whatever the UTC offset happens to be that day).
 */
export function buildDepartureAt(
  departureLocalTime: string,
  serviceDate: string,
  timezone: string,
): string {
  const [y, m, d] = serviceDate.split("-").map(Number) as [number, number, number];
  const [hh, mm] = departureLocalTime.split(":").map(Number) as [number, number];
  return zonedTimeToUtc(y, m, d, hh, mm, timezone).toISOString();
}

/**
 * Status for a run at `now`: 'complete' the moment every active step has a
 * completion (this is a recorded fact, so it wins even past the grace);
 * 'expired' at/after departureAt + 15 minutes; 'active' otherwise.
 */
export function deriveStatus(
  run: RunLike,
  activeSteps: LaunchStep[],
  completedStepIds: string[],
  now: Date,
): "active" | "complete" | "expired" {
  if (activeSteps.length > 0 && activeSteps.every((s) => completedStepIds.includes(s.id))) {
    return "complete";
  }
  const graceEnd = new Date(run.departureAt).getTime() + EXPIRY_GRACE_MINUTES * MINUTE_MS;
  if (now.getTime() >= graceEnd) return "expired";
  return "active";
}

/**
 * True while the countdown is inside the chime lead-up (at or past
 * departureAt - chimeBeforeMinutes), the chime is unacknowledged, and the
 * run is still active. At the exact threshold → true.
 */
export function shouldChime(
  run: StatusRun,
  template: Pick<LaunchTemplate, "chimeBeforeMinutes">,
  now: Date,
): boolean {
  if (run.chimePlayedAt != null) return false;
  if (run.status !== "active") return false;
  const leadMs = template.chimeBeforeMinutes * MINUTE_MS;
  return now.getTime() >= new Date(run.departureAt).getTime() - leadMs;
}

/** Local calendar date key (YYYY-MM-DD) an instant falls on in the zone. */
export function localServiceDate(now: Date, timezone: string): string {
  return localDateKey(now, timezone);
}
