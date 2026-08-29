import { describe, it, expect } from "vitest";
import {
  CalendarEvent,
  CalendarEventInput,
  DashboardSettings,
  DutyDefinition,
  DutyWindowQuery,
  HandoffBoardItem,
  HandoffClaimInput,
  HealthStatus,
  HomeCommand,
  HouseholdListResponse,
  HouseholdMember,
  HouseholdMemberInput,
  LaunchTemplate,
  LaunchTemplateInput,
  PermissionDecision,
  PermissionRequest,
  PermissionRule,
  VoiceNote,
  WeatherReport,
} from "./index";

const NOW = "2026-08-29T12:00:00.000Z";

const member = {
  id: "m1",
  displayName: "Mom",
  role: "adult",
  color: "coral",
  icon: "user",
  sortOrder: 0,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const child = {
  ...member,
  id: "c1",
  displayName: "Ada",
  role: "child",
  icon: "baby",
  color: "teal",
  sortOrder: 1,
};

describe("contracts", () => {
  it("accepts a minimal calendar event input and applies defaults", () => {
    const parsed = CalendarEventInput.safeParse({
      title: "Lunch",
      start: "2026-08-28T17:00:00Z",
      end: "2026-08-28T18:00:00Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.color).toBe("sky");
      expect(parsed.data.allDay).toBe(false);
    }
  });

  it("rejects a calendar event missing title", () => {
    const parsed = CalendarEvent.safeParse({
      id: "1",
      start: "2026-08-28T17:00:00Z",
      end: "2026-08-28T18:00:00Z",
      createdAt: "2026-08-28T17:00:00Z",
      updatedAt: "2026-08-28T17:00:00Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("validates health status", () => {
    const parsed = HealthStatus.safeParse({
      service: "api",
      status: "ok",
      checkedAt: "2026-08-28T17:00:00Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid weather units", () => {
    const parsed = WeatherReport.safeParse({
      location: "x",
      units: "kelvin",
      current: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("validates a home command", () => {
    const parsed = HomeCommand.safeParse({
      entityId: "light.living_room",
      action: "turn_on",
      params: { brightness: 100 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty home command action", () => {
    const parsed = HomeCommand.safeParse({ entityId: "light.living_room", action: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("household members", () => {
  it("accepts adult and child members", () => {
    expect(HouseholdMember.safeParse(member).success).toBe(true);
    expect(HouseholdMember.safeParse(child).success).toBe(true);
  });

  it("rejects an unknown role", () => {
    expect(HouseholdMember.safeParse({ ...member, role: "guest" }).success).toBe(false);
  });

  it("strips role edits out of the member input", () => {
    const parsed = HouseholdMemberInput.parse({ role: "child", displayName: "Ada" });
    expect(parsed.displayName).toBe("Ada");
    expect("role" in parsed).toBe(false);
  });

  it("lists members in a response", () => {
    expect(HouseholdListResponse.safeParse({ members: [member, child] }).success).toBe(true);
  });
});

describe("handoffs", () => {
  const boardItem = {
    id: "h1",
    eventId: "e1",
    startsAt: "2026-08-30T16:15:00Z",
    endsAt: "2026-08-30T16:45:00Z",
    status: "unclaimed",
    updatedBy: "m1",
    createdAt: NOW,
    updatedAt: NOW,
    child,
    eventSummary: {
      id: "e1",
      title: "Soccer pickup",
      start: "2026-08-30T16:15:00Z",
      end: "2026-08-30T16:45:00Z",
      allDay: false,
    },
    attentionState: "night-before",
    availability: [
      {
        memberId: "m1",
        state: "conflict",
        conflicts: [
          {
            eventId: "e2",
            title: "Work call",
            start: "2026-08-30T16:00:00Z",
            end: "2026-08-30T16:30:00Z",
          },
        ],
      },
      { memberId: "m2", state: "available", conflicts: [] },
    ],
    conflictReason: "Pickup at 4:15 PM conflicts with Work call at 4:00 PM",
  };

  it("accepts a board item with availability and a conflict reason", () => {
    expect(HandoffBoardItem.safeParse(boardItem).success).toBe(true);
  });

  it("allows a missing child and rejects a missing attention state", () => {
    expect(HandoffBoardItem.safeParse({ ...boardItem, child: null }).success).toBe(true);
    const { attentionState, ...withoutAttention } = boardItem;
    expect(HandoffBoardItem.safeParse(withoutAttention).success).toBe(false);
  });

  it("requires an actor to claim a handoff", () => {
    expect(HandoffClaimInput.safeParse({}).success).toBe(false);
    expect(HandoffClaimInput.safeParse({ actorId: "m1" }).success).toBe(true);
  });
});

describe("permission rules", () => {
  const rule = {
    id: "r1",
    name: "Weekend screen time",
    category: "screen-time",
    outcome: "approved",
    weekdays: [0, 6],
    priority: 0,
    active: true,
    createdBy: "m1",
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("rejects weekday 7 and accepts weekdays [1, 5]", () => {
    expect(PermissionRule.safeParse({ ...rule, weekdays: [1, 7] }).success).toBe(false);
    expect(PermissionRule.safeParse({ ...rule, weekdays: [1, 5] }).success).toBe(true);
  });

  it("rejects malformed local times and accepts 18:30", () => {
    expect(PermissionRule.safeParse({ ...rule, localStartTime: "25:00" }).success).toBe(false);
    expect(PermissionRule.safeParse({ ...rule, localEndTime: "18:30" }).success).toBe(true);
  });
});

describe("permission requests and decisions", () => {
  const request = {
    id: "p1",
    childId: "c1",
    category: "sleepover",
    question: "Can Ada stay at Sam's tonight?",
    status: "pending",
    createdBy: "c1",
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("parses a pending request without a rule conflict", () => {
    const parsed = PermissionRequest.safeParse(request);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("pending");
      expect(parsed.data.ruleConflict).toBeUndefined();
    }
  });

  const decision = {
    id: "d1",
    requestId: "p1",
    outcome: "approved",
    decidedBy: "m1",
    decidedAt: NOW,
    source: "manual",
  };

  it("accepts a manual decision without a rule id", () => {
    expect(PermissionDecision.safeParse(decision).success).toBe(true);
  });

  it("accepts a standing-rule decision with a rule id", () => {
    const parsed = PermissionDecision.safeParse({ ...decision, source: "standing-rule", ruleId: "r1" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a standing-rule decision without a rule id", () => {
    expect(PermissionDecision.safeParse({ ...decision, source: "standing-rule" }).success).toBe(false);
  });
});

describe("voice notes", () => {
  const note = {
    id: "n1",
    senderId: "m1",
    recipientId: "m2",
    audioUrl: "/media/voice-notes/n1.webm",
    mimeType: "audio/webm",
    durationMs: 4200,
    sizeBytes: 33207,
    createdAt: NOW,
  };

  it("accepts a 60s note and rejects one second longer", () => {
    expect(VoiceNote.safeParse({ ...note, durationMs: 60000 }).success).toBe(true);
    expect(VoiceNote.safeParse({ ...note, durationMs: 60001 }).success).toBe(false);
  });

  it("rejects unsupported mime types", () => {
    expect(VoiceNote.safeParse({ ...note, mimeType: "audio/wav" }).success).toBe(false);
  });

  it("accepts an unread note", () => {
    expect(VoiceNote.safeParse(note).success).toBe(true);
  });
});

describe("launch templates", () => {
  const template = {
    id: "t1",
    childId: "c1",
    name: "School morning",
    weekdays: [1, 2, 3, 4, 5],
    departureLocalTime: "08:10",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const templateInput = {
    childId: "c1",
    name: "School morning",
    weekdays: [1, 2, 3, 4, 5],
    departureLocalTime: "08:10",
    active: true,
  };

  it("rejects unknown launch step icons and accepts known ones", () => {
    expect(
      LaunchTemplateInput.safeParse({
        ...templateInput,
        steps: [{ label: "Shoes on", icon: "spaceship" }],
      }).success,
    ).toBe(false);
    expect(
      LaunchTemplateInput.safeParse({
        ...templateInput,
        steps: [{ label: "Shoes on", icon: "shoes" }],
      }).success,
    ).toBe(true);
  });

  it("rejects malformed departure times and accepts 09:05", () => {
    expect(LaunchTemplate.safeParse({ ...template, departureLocalTime: "9:5" }).success).toBe(false);
    expect(LaunchTemplate.safeParse({ ...template, departureLocalTime: "24:00" }).success).toBe(false);
    expect(LaunchTemplate.safeParse({ ...template, departureLocalTime: "09:05" }).success).toBe(true);
  });
});

describe("calendar family fields", () => {
  const event = {
    id: "e1",
    title: "Soccer pickup",
    start: "2026-08-30T16:15:00Z",
    end: "2026-08-30T16:45:00Z",
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("rejects an empty ownerId", () => {
    expect(CalendarEvent.safeParse({ ...event, ownerId: "" }).success).toBe(false);
  });

  it("applies family defaults to legacy events", () => {
    const parsed = CalendarEvent.parse(event);
    expect(parsed.scheduleKind).toBe("general");
    expect(parsed.requiresHandoff).toBe(false);
    expect(parsed.ownerId).toBeUndefined();
  });

  it("accepts family fields on the event input", () => {
    const parsed = CalendarEventInput.safeParse({
      title: "Dentist",
      start: "2026-09-01T14:00:00Z",
      end: "2026-09-01T15:00:00Z",
      ownerId: "m2",
      scheduleKind: "adult-commitment",
      requiresHandoff: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("family settings defaults", () => {
  it("fills in the family block when parsing legacy settings", () => {
    const parsed = DashboardSettings.parse({});
    expect(parsed.family.handoffAlertTime).toBe("18:00");
    expect(parsed.family.travelBufferMinutes).toBe(15);
    expect(parsed.family.overrunBufferMinutes).toBe(15);
    expect(parsed.family.dutyWindowDays).toBe(30);
  });
});

describe("duties", () => {
  const duty = {
    id: "d1",
    name: "Brush teeth",
    icon: "bedtime",
    color: "teal",
    sortOrder: 0,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("accepts known duty icons and rejects unknown ones", () => {
    expect(DutyDefinition.safeParse(duty).success).toBe(true);
    expect(DutyDefinition.safeParse({ ...duty, icon: "unknown-icon" }).success).toBe(false);
  });

  it("coerces and defaults the duty window query", () => {
    expect(DutyWindowQuery.parse({}).windowDays).toBe(30);
    expect(DutyWindowQuery.parse({ windowDays: "7" }).windowDays).toBe(7);
    expect(DutyWindowQuery.safeParse({ windowDays: 366 }).success).toBe(false);
  });
});
