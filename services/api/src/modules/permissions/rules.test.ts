import { describe, expect, it } from "vitest";
import type { PermissionCategory, PermissionRule } from "@home-dashboard/contracts";
import { evaluateRules } from "./rules.js";

const ZONE = "America/New_York";
const NOW = new Date("2030-01-01T12:00:00.000Z");
/** 2030-01-04 is a Friday; 18:00 local (EST, UTC-5) is 23:00 UTC. */
const FRIDAY_18 = "2030-01-04T23:00:00.000Z";
/** Same Friday at 21:00 local — 02:00 UTC on the following UTC day. */
const FRIDAY_21 = "2030-01-05T02:00:00.000Z";

let ruleCount = 0;

function makeRule(overrides: Partial<PermissionRule> = {}): PermissionRule {
  ruleCount += 1;
  return {
    id: `rule-${ruleCount}`,
    name: `Rule ${ruleCount}`,
    category: "sleepover",
    outcome: "approved",
    weekdays: [5],
    priority: 0,
    active: true,
    createdBy: "member-you",
    createdAt: new Date(NOW.getTime() + ruleCount).toISOString(),
    updatedAt: new Date(NOW.getTime() + ruleCount).toISOString(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<{ category: PermissionCategory; occursAt: string }> = {}) {
  return { category: "sleepover" as PermissionCategory, occursAt: FRIDAY_18, ...overrides };
}

describe("evaluateRules (pure, America/New_York)", () => {
  it("1. auto-approves a Friday sleepover when an active Friday approve rule matches", () => {
    const rule = makeRule({ name: "Friday sleepovers" });
    const result = evaluateRules(makeRequest(), [rule], { now: NOW, timezone: ZONE });
    expect(result.decision).toBe("approved");
    expect(result.ruleId).toBe(rule.id);
    expect(result.conflict).toBeUndefined();
  });

  it("2. ignores a Thursday-only rule for a Friday request", () => {
    const rule = makeRule({ name: "Thursday sleepovers", weekdays: [4] });
    const result = evaluateRules(makeRequest(), [rule], { now: NOW, timezone: ZONE });
    expect(result.decision).toBeNull();
    expect(result.ruleId).toBeUndefined();
  });

  it("3. reports a conflict when same-priority rules disagree", () => {
    const yes = makeRule({ name: "Friday yes", priority: 5, outcome: "approved" });
    const no = makeRule({ name: "Friday no", priority: 5, outcome: "denied" });
    const result = evaluateRules(makeRequest(), [yes, no], { now: NOW, timezone: ZONE });
    expect(result.decision).toBeNull();
    expect(result.conflict).toBeDefined();
    expect(result.conflict).toContain("Friday yes");
    expect(result.conflict).toContain("Friday no");
  });

  it("4. lets a higher-priority approve outrank a lower-priority deny", () => {
    const deny = makeRule({ name: "Default no", priority: 1, outcome: "denied" });
    const approve = makeRule({ name: "Parents said yes", priority: 10, outcome: "approved" });
    const result = evaluateRules(makeRequest(), [deny, approve], { now: NOW, timezone: ZONE });
    expect(result.decision).toBe("approved");
    expect(result.ruleId).toBe(approve.id);
  });

  it("5. excludes a 21:00 request when the rule only covers 18:00–20:00", () => {
    const rule = makeRule({
      name: "Early evenings only",
      localStartTime: "18:00",
      localEndTime: "20:00",
    });
    const result = evaluateRules(makeRequest({ occursAt: FRIDAY_21 }), [rule], {
      now: NOW,
      timezone: ZONE,
    });
    expect(result.decision).toBeNull();
  });

  it("6. excludes a rule whose activeUntil ended before the request", () => {
    const rule = makeRule({ name: "Old policy", activeUntil: "2030-01-03T23:59:59.999Z" });
    const result = evaluateRules(makeRequest(), [rule], { now: NOW, timezone: ZONE });
    expect(result.decision).toBeNull();
  });
});
