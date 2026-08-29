import { TZDate } from "@date-fns/tz";
import type { PermissionCategory, PermissionRule } from "@home-dashboard/contracts";

/**
 * The slice of a permission request the rules engine needs.
 *
 * Contract note: rules ALWAYS require a weekday match, so a request without an
 * `occursAt` instant can never auto-decide — it stays pending for a human.
 */
export interface EvaluatableRequest {
  category: PermissionCategory;
  occursAt?: string;
}

/** Evaluation inputs: the current instant and the dashboard timezone. */
export interface RuleEvaluationInputs {
  now: Date | string;
  timezone: string;
}

/** Outcome of matching a request against the standing rules. */
export interface RuleEvaluation {
  /** The auto-decision, or null when no rule decided (pending stays human). */
  decision: "approved" | "denied" | null;
  /** The winning rule; set whenever `decision` is set. */
  ruleId?: string;
  /** Set when the top-priority tier disagreed and the decision was withheld. */
  conflict?: string;
}

/** "HH:MM" → minutes since local midnight. */
function parseHHmm(value: string): number {
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  return hours * 60 + minutes;
}

/** Inclusive activeFrom/activeUntil range check against the request instant. */
function withinActiveRange(rule: PermissionRule, occursMs: number): boolean {
  if (rule.activeFrom !== undefined && occursMs < new Date(rule.activeFrom).getTime()) {
    return false;
  }
  if (rule.activeUntil !== undefined && occursMs > new Date(rule.activeUntil).getTime()) {
    return false;
  }
  return true;
}

/**
 * Local time-of-day window. A single bound means unbounded on the other side;
 * start > end means the window wraps midnight (e.g. 20:00–06:00).
 */
function withinTimeWindow(rule: PermissionRule, localMinutes: number): boolean {
  const start = rule.localStartTime === undefined ? null : parseHHmm(rule.localStartTime);
  const end = rule.localEndTime === undefined ? null : parseHHmm(rule.localEndTime);

  if (start === null) {
    return end === null || localMinutes <= end;
  }
  if (end === null) {
    return localMinutes >= start;
  }
  if (start <= end) {
    return localMinutes >= start && localMinutes <= end;
  }
  return localMinutes >= start || localMinutes <= end;
}

/**
 * Pure standing-rules engine: match a request against the rules and decide.
 *
 * 1. Only ACTIVE rules for the request's category are considered.
 * 2. The request's `occursAt` is read in the dashboard timezone to derive the
 *    local weekday (0–6, Sunday first) and local time-of-day.
 * 3. A rule matches when its weekdays contain that weekday, its active
 *    range contains the instant, and its local time window contains the
 *    local time.
 * 4. Matches are ranked priority DESC, then createdAt ASC. When the whole
 *    top-priority tier agrees, its outcome wins and `ruleId` points at the
 *    earliest-created rule in that tier. When the tier disagrees, the
 *    decision is withheld and `conflict` names the disagreeing rules.
 */
export function evaluateRules(
  request: EvaluatableRequest,
  rules: PermissionRule[],
  inputs: RuleEvaluationInputs,
): RuleEvaluation {
  // Rules always require a weekday match, so a request without occursAt never
  // auto-decides — it stays pending for an adult to decide manually.
  if (request.occursAt === undefined) {
    return { decision: null };
  }

  const occursAt = new Date(request.occursAt);
  const local = new TZDate(occursAt, inputs.timezone);
  const weekday = local.getDay();
  const localMinutes = local.getHours() * 60 + local.getMinutes();

  const matches = rules.filter(
    (rule) =>
      rule.active &&
      rule.category === request.category &&
      rule.weekdays.includes(weekday) &&
      withinActiveRange(rule, occursAt.getTime()) &&
      withinTimeWindow(rule, localMinutes),
  );

  if (matches.length === 0) {
    return { decision: null };
  }

  const sorted = [...matches].sort(
    (a, b) =>
      b.priority - a.priority ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const top = sorted[0];
  if (top === undefined) {
    return { decision: null };
  }

  const tier = sorted.filter((rule) => rule.priority === top.priority);
  const outcomes = new Set(tier.map((rule) => rule.outcome));
  if (outcomes.size > 1) {
    const names = tier.map((rule) => rule.name).join(" vs ");
    return { decision: null, conflict: `Rules disagree: ${names}` };
  }

  return { decision: top.outcome, ruleId: top.id };
}
