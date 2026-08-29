import { beforeEach, describe, expect, it } from "vitest";
import { PermissionReopenInput } from "@home-dashboard/contracts";
import type { PermissionRuleInput } from "@home-dashboard/contracts";
import { Database } from "../../platform/database.js";
import { FixedClock } from "../../test/testClock.js";
import { ConflictError } from "../handoffs/repository.js";
import { HouseholdRepository } from "../household/repository.js";
import { SettingsStore } from "../settings/routes.js";
import { PermissionRepository } from "./repository.js";

/** Seeded members: You/Partner are adults, Kid is a child. */
const YOU = "member-you";
const PARTNER = "member-partner";
const KID = "member-kid";

/** 2030-01-04 is a Friday; 18:00 America/New_York (EST, UTC-5) is 23:00 UTC. */
const FRIDAY_18 = "2030-01-04T23:00:00.000Z";
/** 2030-01-03 is a Thursday. */
const THURSDAY_18 = "2030-01-03T23:00:00.000Z";

let db: Database;
let repo: PermissionRepository;
let clock: FixedClock;

beforeEach(() => {
  db = new Database(":memory:");
  const household = new HouseholdRepository(db);
  const settings = new SettingsStore(db);
  settings.set({ timezone: "America/New_York" });
  clock = new FixedClock("2030-01-01T12:00:00.000Z");
  repo = new PermissionRepository(db, household, settings, clock);
});

function ruleInput(overrides: Partial<PermissionRuleInput> = {}): PermissionRuleInput {
  return {
    actorId: YOU,
    name: "Friday sleepovers",
    category: "sleepover",
    outcome: "approved",
    weekdays: [5],
    priority: 1,
    active: true,
    ...overrides,
  };
}

describe("permission repository", () => {
  it("7. auto-approves a Friday sleepover end-to-end via a standing rule", () => {
    const rule = repo.createRule(ruleInput());
    const created = repo.create({
      childId: KID,
      category: "sleepover",
      question: "Sleepover at Maya's?",
      occursAt: FRIDAY_18,
      createdBy: KID,
    });

    expect(created.status).toBe("approved");
    expect(created.ruleConflict).toBeNull();
    expect(created.createdAt).toBe(clock.nowIso());
    expect(created.decisions).toHaveLength(1);
    const decision = created.decisions[0]!;
    expect(decision.source).toBe("standing-rule");
    expect(decision.ruleId).toBe(rule.id);
    expect(decision.decidedBy).toBe("system");
    expect(decision.decidedAt).toBe(clock.nowIso());
  });

  it("8. keeps a Thursday sleepover pending with no decisions", () => {
    repo.createRule(ruleInput());
    const created = repo.create({
      childId: KID,
      category: "sleepover",
      question: "Sleepover at Maya's?",
      occursAt: THURSDAY_18,
      createdBy: KID,
    });

    expect(created.status).toBe("pending");
    expect(created.decisions).toHaveLength(0);
    expect(created.ruleConflict).toBeNull();
  });

  it("9. records the acting adult and a SERVER decidedAt on manual approval", () => {
    const created = repo.create({
      childId: KID,
      category: "screen-time",
      question: "30 more minutes of Roblox?",
      createdBy: KID,
    });
    clock.advanceMs(90_000);

    const decided = repo.decide(created.id, {
      actorId: PARTNER,
      outcome: "approved",
      note: "OK this once",
    });

    expect(decided).toBeDefined();
    const request = decided!;
    expect(request.status).toBe("approved");
    expect(request.decisions).toHaveLength(1);
    const decision = request.decisions[0]!;
    expect(decision.source).toBe("manual");
    expect(decision.decidedBy).toBe(PARTNER);
    // Server time, not client-supplied: the clock advanced past createdAt.
    expect(decision.decidedAt).toBe(clock.nowIso());
    expect(decision.decidedAt).not.toBe(request.createdAt);
    expect(decision.note).toBe("OK this once");
  });

  it("10. rejects a second decision on an already-decided request", () => {
    const created = repo.create({
      childId: KID,
      category: "outing",
      question: "Trip to the skate park?",
      createdBy: KID,
    });
    repo.decide(created.id, { actorId: YOU, outcome: "denied" });
    clock.advanceMs(1_000);

    expect(() => repo.decide(created.id, { actorId: YOU, outcome: "approved" })).toThrow(ConflictError);

    const after = repo.getWithDecisions(created.id)!;
    expect(after.status).toBe("denied");
    expect(after.decisions).toHaveLength(1);
    expect(after.decisions[0]!.outcome).toBe("denied");
  });

  it("11. reopen preserves prior decisions, resets to pending, and requires a reason", () => {
    const created = repo.create({
      childId: KID,
      category: "purchase",
      question: "New soccer cleats?",
      createdBy: KID,
    });
    repo.decide(created.id, { actorId: YOU, outcome: "approved" });
    clock.advanceMs(1_000);

    const reopened = repo.reopen(created.id, { actorId: YOU, reason: "Budget changed this week" })!;
    expect(reopened.status).toBe("pending");
    expect(reopened.ruleConflict).toBeNull();

    const outcomes = reopened.decisions.map((d) => d.outcome);
    expect(outcomes).toContain("approved");
    expect(outcomes).toContain("reopened");
    const reopenDecision = reopened.decisions.find((d) => d.outcome === "reopened")!;
    expect(reopenDecision.note).toBe("Budget changed this week");
    expect(reopenDecision.decidedBy).toBe(YOU);

    // The contract rejects an empty reason before the repository ever sees it.
    const parsed = PermissionReopenInput.safeParse({ actorId: YOU, reason: "" });
    expect(parsed.success).toBe(false);
  });

  it("12. expires stale pending requests and requires a reopen before deciding", () => {
    const created = repo.create({
      childId: KID,
      category: "outing",
      question: "Pool day?",
      expiresAt: "2030-01-01T13:00:00.000Z",
      createdBy: KID,
    });
    clock.advanceTo("2030-01-01T14:00:00.000Z");

    const queue = repo.queue();
    expect(queue.pending.map((r) => r.id)).not.toContain(created.id);
    const expired = queue.recent.find((r) => r.id === created.id);
    expect(expired?.status).toBe("expired");

    let conflictMessage = "";
    try {
      repo.decide(created.id, { actorId: YOU, outcome: "approved" });
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      conflictMessage = (err as Error).message;
    }
    expect(conflictMessage).toMatch(/expired/);

    const reopened = repo.reopen(created.id, { actorId: YOU, reason: "Back on the table" })!;
    expect(reopened.status).toBe("pending");
    // The stale deadline is cleared so the reopened request is decidable.
    expect(reopened.expiresAt).toBeUndefined();

    const decided = repo.decide(created.id, { actorId: YOU, outcome: "approved" })!;
    expect(decided.status).toBe("approved");
  });
});
