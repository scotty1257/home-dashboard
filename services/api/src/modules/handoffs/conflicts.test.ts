import { describe, it, expect } from "vitest";
import {
  adultConflictsForHandoff,
  attentionStateFor,
  buildBoardItems,
  type ConflictInputs,
} from "./conflicts.js";

// America/New_York in August 2026 is UTC-4 (EDT).
const TZ = "America/New_York";

function inputs(overrides: Partial<ConflictInputs> = {}): ConflictInputs {
  return {
    now: new Date("2026-06-10T12:00:00Z"), // Wednesday
    timezone: TZ,
    travelBufferMinutes: 15,
    overrunBufferMinutes: 15,
    handoffAlertTime: "18:00",
    ...overrides,
  };
}

/** June 11 2026 is a Thursday. Times given in local EDT, emitted as ISO with -04:00. */
function local(dayIso: string, h: number, m = 0): string {
  return `${dayIso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;
}

const THU = "2026-06-11";

const you = {
  id: "member-you",
  displayName: "You",
  role: "adult" as const,
  color: "coral" as const,
  icon: "user" as const,
  sortOrder: 0,
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const partner = { ...you, id: "member-partner", displayName: "Partner", sortOrder: 1 };

const kid = {
  ...you,
  id: "member-kid",
  displayName: "Kid",
  role: "child" as const,
  sortOrder: 2,
};

const handoff = {
  id: "handoff-1",
  eventId: "evt-pickup",
  startsAt: local(THU, 16, 15),
  endsAt: local(THU, 16, 30),
  status: "unclaimed" as const,
  updatedBy: "system",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

function adultEvent(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-call",
    calendarId: "local",
    title: "Call",
    start: local(THU, 16, 0),
    end: local(THU, 16, 15),
    allDay: false,
    color: "sky" as const,
    recurrence: { frequency: "none" as const, interval: 1 },
    reminders: [],
    ownerId: "member-you",
    scheduleKind: "adult-commitment" as const,
    requiresHandoff: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("adultConflictsForHandoff", () => {
  it("flags a 16:00–16:15 call buffered by overrun against a 16:15 pickup", () => {
    const conflicts = adultConflictsForHandoff(
      handoff,
      [adultEvent()],
      inputs(),
      "member-you",
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.id).toBe("evt-call");
    expect(conflicts[0]!.title).toBe("Call");
  });

  it("does not conflict when intervals are adjacent with zero buffers", () => {
    const conflicts = adultConflictsForHandoff(
      handoff,
      [adultEvent()],
      inputs({ travelBufferMinutes: 0, overrunBufferMinutes: 0 }),
      "member-you",
    );
    // Need 16:15..16:30; call buffered to 16:15 exactly -> adultEnd(16:15) > needStart(16:15) false.
    expect(conflicts).toHaveLength(0);
  });

  it("conflicts for the full local day when the adult event is all-day", () => {
    const allDay = adultEvent({
      id: "evt-allday",
      title: "Away day",
      start: `${THU}T00:00:00-04:00`,
      end: `${THU}T23:59:59-04:00`,
      allDay: true,
    });
    const conflicts = adultConflictsForHandoff(handoff, [allDay], inputs(), "member-you");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.id).toBe("evt-allday");
  });

  it("ignores the calendar event backing the handoff itself", () => {
    const backing = adultEvent({
      id: "evt-pickup",
      title: "Pickup",
      start: handoff.startsAt,
      end: handoff.endsAt,
      scheduleKind: "child-commitment",
    });
    const conflicts = adultConflictsForHandoff(handoff, [backing], inputs(), "member-you");
    expect(conflicts).toHaveLength(0);
  });

  it("ignores events owned by other adults", () => {
    const conflicts = adultConflictsForHandoff(
      handoff,
      [adultEvent({ ownerId: "member-partner" })],
      inputs(),
      "member-you",
    );
    expect(conflicts).toHaveLength(0);
  });

  it("ignores general (unattributed) events", () => {
    const conflicts = adultConflictsForHandoff(
      handoff,
      [adultEvent({ scheduleKind: "general", ownerId: undefined })],
      inputs(),
      "member-you",
    );
    expect(conflicts).toHaveLength(0);
  });

  it("matches across a DST transition day using wall-clock instants", () => {
    // 2026-03-09 is the day after US spring-forward (Mar 8 2026). 09:00 EDT = 13:00Z.
    const dstHandoff = {
      ...handoff,
      id: "handoff-dst",
      eventId: "evt-dst-pickup",
      startsAt: "2026-03-09T09:00:00-04:00",
      endsAt: "2026-03-09T09:15:00-04:00",
    };
    const dstCall = adultEvent({
      id: "evt-dst-call",
      title: "DST call",
      start: "2026-03-09T09:00:00-04:00",
      end: "2026-03-09T09:15:00-04:00",
    });
    const conflicts = adultConflictsForHandoff(
      dstHandoff,
      [dstCall],
      inputs({
        now: new Date("2026-03-08T12:00:00Z"),
        travelBufferMinutes: 0,
        overrunBufferMinutes: 0,
      }),
      "member-you",
    );
    expect(conflicts).toHaveLength(1);
  });
});

describe("attentionStateFor", () => {
  it("is planned well before the night-before alert time", () => {
    // Wed June 10 17:59:59 local is before 18:00 — handoff is Thu.
    const state = attentionStateFor(handoff, inputs({ now: new Date("2026-06-10T21:59:59Z") }));
    expect(state).toBe("planned");
  });

  it("becomes night-before exactly at 18:00 local the preceding day", () => {
    const state = attentionStateFor(handoff, inputs({ now: new Date("2026-06-10T22:00:00Z") }));
    expect(state).toBe("night-before");
  });

  it("is urgent exactly two hours before the handoff starts", () => {
    // Handoff starts 16:15 EDT = 20:15Z; two hours before = 18:15Z.
    const state = attentionStateFor(handoff, inputs({ now: new Date("2026-06-11T18:15:00Z") }));
    expect(state).toBe("urgent");
  });

  it("is resolved when the obligation is resolved", () => {
    const state = attentionStateFor(
      { ...handoff, status: "resolved" },
      inputs({ now: new Date("2026-06-10T22:00:00Z") }),
    );
    expect(state).toBe("resolved");
  });

  it("handles the fall-back boundary for the night-before state", () => {
    // Nov 1 2026 is fall-back day. Handoff Sun Nov 1 09:00 EST (14:00Z).
    // Night before = Sat Oct 31 18:00 local. On Oct 31 the zone is still EDT
    // (UTC-4), so 18:00 local = 22:00Z.
    const dstHandoff = {
      ...handoff,
      startsAt: "2026-11-01T09:00:00-05:00",
      endsAt: "2026-11-01T09:30:00-05:00",
    };
    const before = attentionStateFor(dstHandoff, inputs({ now: new Date("2026-10-31T21:59:59Z") }));
    expect(before).toBe("planned");
    const at = attentionStateFor(dstHandoff, inputs({ now: new Date("2026-10-31T22:00:00Z") }));
    expect(at).toBe("night-before");
  });
});

describe("buildBoardItems", () => {
  it("recommends the first available adult for an unclaimed handoff without assigning", () => {
    const items = buildBoardItems(
      [handoff],
      [
        adultEvent(), // You is busy
      ],
      [you, partner, kid],
      inputs(),
    );
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.status).toBe("unclaimed");
    expect(item.assigneeMemberId).toBeUndefined();
    expect(item.recommendedMemberId).toBe("member-partner");
    expect(item.availability.find((a) => a.memberId === "member-you")!.state).toBe("conflict");
    expect(item.availability.find((a) => a.memberId === "member-partner")!.state).toBe("available");
    expect(item.conflictReason).toBeTruthy();
    expect(item.conflictReason).toContain("Call");
  });

  it("recommends the first adult in sort order when everyone is free", () => {
    const items = buildBoardItems([handoff], [], [you, partner, kid], inputs());
    expect(items[0]!.recommendedMemberId).toBe("member-you");
    expect(items[0]!.availability.every((a) => a.state === "available")).toBe(true);
  });

  it("does not recommend anyone once the handoff is claimed", () => {
    const claimed = { ...handoff, status: "claimed" as const, assigneeMemberId: "member-you" };
    const items = buildBoardItems([claimed], [], [you, partner, kid], inputs());
    expect(items[0]!.recommendedMemberId).toBeUndefined();
  });

  it("attaches the child member backing the event and an event summary", () => {
    const items = buildBoardItems(
      [handoff],
      [adultEvent({ id: "evt-pickup", title: "Early dismissal pickup", ownerId: "member-kid", scheduleKind: "child-commitment" })],
      [you, partner, kid],
      inputs(),
    );
    const item = items[0]!;
    expect(item.child?.id).toBe("member-kid");
    expect(item.eventSummary?.title).toBe("Early dismissal pickup");
  });
});
