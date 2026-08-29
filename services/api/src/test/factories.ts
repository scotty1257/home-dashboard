import type { CalendarEvent } from "@home-dashboard/contracts";

/**
 * Deterministic entity factories for family-feature tests.
 *
 * Everything here is counter-based and side-effect free: no random ids, no
 * `Date.now()`. Fixtures are reproducible because every value derives from a
 * module-local counter or the fixed anchor instant below.
 *
 * The shapes intentionally mirror the household contracts that land in a
 * later task (HouseholdMember, family fields on CalendarEvent). Until then
 * they are structural local types so tests can adopt them without waiting on
 * the contract modules; only `CalendarEvent` — which already exists — is
 * imported from `@home-dashboard/contracts`.
 */

/**
 * Fixed neutral instant used as the base for factory timestamps. Deliberately
 * far in the future so fixtures never collide with "now"-based logic.
 */
export const FACTORY_EPOCH = "2030-01-05T09:00:00.000Z";

/**
 * Family scheduling kinds. Mirrors the values the household contracts will
 * use; "general" is the default applied to legacy events. Widen this union
 * when the formal contract lands.
 */
export type EventScheduleKind = "general" | "adult-commitment";

/**
 * Household member as the family features persist it. Timestamps are optional
 * so lightweight UI fixtures can omit them, but `makeMember` always fills
 * them in.
 */
export interface MemberSeed {
  id: string;
  displayName: string;
  role: "adult" | "child";
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type MemberOverrides = Partial<MemberSeed>;

/**
 * CalendarEvent plus the family-extension fields the household contracts will
 * formalize (owning member, scheduling kind, handoff requirement).
 */
export interface FamilyCalendarEvent extends CalendarEvent {
  ownerId: string;
  scheduleKind: EventScheduleKind;
  requiresHandoff: boolean;
}

export type FamilyCalendarEventOverrides = Partial<FamilyCalendarEvent>;

let memberCount = 0;
let eventCount = 0;

/** Next deterministic member id: "member-1", "member-2", … */
export function nextMemberId(): string {
  memberCount += 1;
  return `member-${memberCount}`;
}

/** Next deterministic event id: "evt-1", "evt-2", … */
export function nextEventId(): string {
  eventCount += 1;
  return `evt-${eventCount}`;
}

/** Reset the id counters; call from `beforeEach` for cross-test isolation. */
export function resetFactories(): void {
  memberCount = 0;
  eventCount = 0;
}

const MEMBER_NAMES = ["Avery", "Blair", "Casey", "Dana", "Ellis", "Frankie", "Greer", "Hadley"] as const;
const MEMBER_COLORS = ["coral", "amber", "teal", "sky", "indigo", "violet", "rose", "lime", "slate"] as const;

/**
 * Build a household member. Defaults rotate through a fixed palette so
 * repeated bare calls yield visibly distinct members; override anything the
 * test cares about.
 */
export function makeMember(overrides: MemberOverrides = {}): MemberSeed {
  const n = memberCount + 1;
  return {
    id: nextMemberId(),
    displayName: MEMBER_NAMES[(n - 1) % MEMBER_NAMES.length] ?? `Member ${n}`,
    role: "adult",
    color: MEMBER_COLORS[(n - 1) % MEMBER_COLORS.length] ?? "sky",
    icon: "user",
    sortOrder: n - 1,
    active: true,
    createdAt: FACTORY_EPOCH,
    updatedAt: FACTORY_EPOCH,
    ...overrides,
  };
}

/**
 * Build a family-flavored calendar event. Defaults to a one-hour "general"
 * event owned by the first member ("member-1", i.e. what the first
 * `makeMember()` call produces) with no handoff required.
 */
export function makeCalendarEvent(overrides: FamilyCalendarEventOverrides = {}): FamilyCalendarEvent {
  return {
    id: nextEventId(),
    calendarId: "local",
    title: "Family event",
    start: FACTORY_EPOCH,
    end: new Date(new Date(FACTORY_EPOCH).getTime() + 3_600_000).toISOString(),
    allDay: false,
    color: "sky",
    recurrence: { frequency: "none", interval: 1 },
    reminders: [],
    createdAt: FACTORY_EPOCH,
    updatedAt: FACTORY_EPOCH,
    ownerId: "member-1",
    scheduleKind: "general",
    requiresHandoff: false,
    ...overrides,
  };
}
