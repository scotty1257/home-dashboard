import { TZDate, tzOffset } from "@date-fns/tz";
import type {
  AdultAvailability,
  BackupContact,
  HandoffBoardItem,
  HandoffObligation,
  HouseholdMember,
} from "@home-dashboard/contracts";

export interface ConflictInputs {
  now: Date;
  timezone: string;
  travelBufferMinutes: number;
  overrunBufferMinutes: number;
  handoffAlertTime: string;
}

/** A calendar event flattened to just what conflict math needs. */
export interface ConflictEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  ownerId?: string;
  scheduleKind: "general" | "adult-commitment" | "child-commitment";
}

const MINUTE_MS = 60_000;

/** Wall-clock view of an instant in a zone. */
function localParts(when: Date | string, timezone: string): TZDate {
  return new TZDate(new Date(when), timezone);
}

/**
 * Convert a wall-clock day + HH:mm in `timezone` into a UTC Date, DST-aware.
 * Two-pass offset resolution: guess the offset at the naive instant, correct,
 * then re-check at the corrected instant (standard handling for
 * non-existent/ambiguous local times, which land on the shifted offset).
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset1 = tzOffset(timezone, new Date(naive)) * MINUTE_MS;
  const first = naive - offset1;
  const offset2 = tzOffset(timezone, new Date(first)) * MINUTE_MS;
  return new Date(naive - offset2);
}

/** Local calendar date key YYYY-MM-DD in the zone. */
export function localDateKey(when: Date | string, timezone: string): string {
  const local = localParts(when, timezone);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())}`;
}

/** Full local day [00:00, next-day 00:00) for an all-day event, as UTC instants. */
function fullLocalDay(event: ConflictEvent, timezone: string): { start: Date; end: Date } {
  const key = localDateKey(event.start, timezone);
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const start = zonedTimeToUtc(y, m, d, 0, 0, timezone);
  // Calendar-day math on naive components (safe across DST: 23/25h days).
  const next = new Date(Date.UTC(y, m - 1, d) + 24 * 60 * MINUTE_MS);
  const end = zonedTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    timezone,
  );
  return { start, end };
}

export interface HandoffLike {
  id: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Conflicting adult commitments for one adult against one handoff.
 *
 * The handoff need expands to [startsAt - travelBuffer, endsAt); each adult
 * commitment expands to [start, end + overrunBuffer). Intervals conflict when
 * adultStart < needEnd && adultEnd > needStart. All-day commitments conflict
 * for the full local day. The event backing the handoff is skipped. Returns
 * every conflicting event so the UI can explain the flag.
 */
export function adultConflictsForHandoff(
  handoff: HandoffLike,
  events: ConflictEvent[],
  inputs: ConflictInputs,
  adultMemberId: string,
): ConflictEvent[] {
  const needStart = new Date(handoff.startsAt).getTime() - inputs.travelBufferMinutes * MINUTE_MS;
  const needEnd = new Date(handoff.endsAt).getTime();

  const conflicts: ConflictEvent[] = [];
  for (const event of events) {
    if (event.id === handoff.eventId) continue;
    if (event.ownerId !== adultMemberId) continue;
    if (event.scheduleKind !== "adult-commitment") continue;

    let adultStart: number;
    let adultEnd: number;
    if (event.allDay) {
      const day = fullLocalDay(event, inputs.timezone);
      adultStart = day.start.getTime();
      adultEnd = day.end.getTime();
    } else {
      adultStart = new Date(event.start).getTime();
      adultEnd = new Date(event.end).getTime() + inputs.overrunBufferMinutes * MINUTE_MS;
    }

    if (adultStart < needEnd && adultEnd > needStart) {
      conflicts.push(event);
    }
  }
  return conflicts;
}

/** Attention state for an obligation given the injected clock and settings. */
export function attentionStateFor(
  handoff: Pick<HandoffObligation, "status" | "startsAt">,
  inputs: ConflictInputs,
): "planned" | "night-before" | "urgent" | "resolved" {
  if (handoff.status === "resolved") return "resolved";

  const start = new Date(handoff.startsAt).getTime();
  if (inputs.now.getTime() >= start - 2 * 60 * MINUTE_MS) return "urgent";

  // Night-before: on the local calendar day before the handoff's local day,
  // at/after the alert time (default 18:00 local).
  const [ah, am] = inputs.handoffAlertTime.split(":").map(Number) as [number, number];
  const handoffLocal = localParts(handoff.startsAt, inputs.timezone);
  const prevNaive = new Date(
    Date.UTC(handoffLocal.getFullYear(), handoffLocal.getMonth(), handoffLocal.getDate()) -
      24 * 60 * MINUTE_MS,
  );
  const alertAt = zonedTimeToUtc(
    prevNaive.getUTCFullYear(),
    prevNaive.getUTCMonth() + 1,
    prevNaive.getUTCDate(),
    ah,
    am,
    inputs.timezone,
  );
  if (inputs.now.getTime() >= alertAt.getTime()) return "night-before";

  return "planned";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Short local time label, e.g. "4:15 PM". */
export function formatLocalTime(iso: string, timezone: string): string {
  const local = localParts(iso, timezone);
  const h24 = local.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${String(local.getMinutes()).padStart(2, "0")} ${ampm}`;
}

/** Weekday label, e.g. "Thursday", in the zone. */
export function weekdayLabel(iso: string, timezone: string): string {
  return WEEKDAYS[localParts(iso, timezone).getDay()] ?? "";
}

/**
 * Assemble board items from obligations + calendar events + members.
 * Pure: nothing is persisted; recommendations never silently assign.
 */
export function buildBoardItems(
  obligations: HandoffObligation[],
  events: ConflictEvent[],
  members: HouseholdMember[],
  inputs: ConflictInputs,
  backupContacts: BackupContact[] = [],
): HandoffBoardItem[] {
  const adults = members
    .filter((m) => m.active && m.role === "adult")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const memberById = new Map(members.map((m) => [m.id, m] as const));

  return obligations.map((obligation) => {
    const backingEvent = events.find((e) => e.id === obligation.eventId) ?? null;
    const child = backingEvent?.ownerId ? (memberById.get(backingEvent.ownerId) ?? null) : null;

    const availability: AdultAvailability[] = adults.map((adult) => {
      const conflicts = adultConflictsForHandoff(obligation, events, inputs, adult.id);
      return {
        memberId: adult.id,
        state: conflicts.length > 0 ? ("conflict" as const) : ("available" as const),
        conflicts: conflicts.map((c) => ({
          eventId: c.id,
          title: c.title,
          start: c.start,
          end: c.end,
        })),
      };
    });

    // For an unclaimed item, recommend the first available adult in household
    // sort order — never silently assign.
    let recommendedMemberId: string | undefined;
    if (obligation.status === "unclaimed") {
      recommendedMemberId = availability.find((a) => a.state === "available")?.memberId;
    }

    // A human explanation of the conflict: the assigned adult's conflict when
    // assigned and busy, otherwise the first busy adult.
    const explainAvailability = obligation.assigneeMemberId
      ? (availability.find(
          (a) => a.memberId === obligation.assigneeMemberId && a.conflicts.length > 0,
        ) ?? availability.find((a) => a.conflicts.length > 0))
      : availability.find((a) => a.conflicts.length > 0);

    let conflictReason: string | null = null;
    const firstConflict = explainAvailability?.conflicts[0];
    if (explainAvailability && firstConflict) {
      const name = memberById.get(explainAvailability.memberId)?.displayName ?? "Adult";
      const label = backingEvent?.title ?? "Handoff";
      conflictReason = `${label} at ${formatLocalTime(obligation.startsAt, inputs.timezone)} conflicts with ${name}'s ${firstConflict.title} at ${formatLocalTime(firstConflict.start, inputs.timezone)}`;
    }

    const assignee = obligation.assigneeMemberId
      ? (memberById.get(obligation.assigneeMemberId) ?? null)
      : null;
    const backupContact = obligation.backupContactId
      ? (backupContacts.find((c) => c.id === obligation.backupContactId) ?? null)
      : null;

    return {
      ...obligation,
      child,
      eventSummary: backingEvent
        ? {
            id: backingEvent.id,
            title: backingEvent.title,
            start: backingEvent.start,
            end: backingEvent.end,
            allDay: backingEvent.allDay,
          }
        : null,
      assignee: assignee ?? undefined,
      backupContact: backupContact ?? undefined,
      attentionState: attentionStateFor(obligation, inputs),
      availability,
      recommendedMemberId,
      conflictReason,
    };
  });
}
