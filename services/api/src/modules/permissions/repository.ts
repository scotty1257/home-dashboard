import { randomUUID } from "node:crypto";
import type {
  PermissionDecision,
  PermissionDecisionInput,
  PermissionQueueResponse,
  PermissionRequest,
  PermissionRequestInput,
  PermissionRequestWithDecisions,
  PermissionReopenInput,
  PermissionRule,
  PermissionRuleInput,
} from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";
import { RealClock, type Clock } from "../../test/testClock.js";
import { ConflictError } from "../handoffs/repository.js";
import { RoleError } from "../household/repository.js";
import type { HouseholdRepository } from "../household/repository.js";
import type { SettingsStore } from "../settings/routes.js";
import { evaluateRules } from "./rules.js";

export { ConflictError, RoleError };

interface RequestRow {
  id: string;
  child_id: string;
  category: string;
  question: string;
  occurs_at: string | null;
  expires_at: string | null;
  status: string;
  rule_conflict: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DecisionRow {
  id: string;
  request_id: string;
  outcome: string;
  decided_by: string;
  decided_at: string;
  source: string;
  rule_id: string | null;
  note: string | null;
}

interface RuleRow {
  id: string;
  name: string;
  category: string;
  outcome: string;
  weekdays: string;
  local_start_time: string | null;
  local_end_time: string | null;
  active_from: string | null;
  active_until: string | null;
  priority: number;
  active: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToRequest(row: RequestRow): PermissionRequest {
  return {
    id: row.id,
    childId: row.child_id,
    category: row.category as PermissionRequest["category"],
    question: row.question,
    occursAt: row.occurs_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    status: row.status as PermissionRequest["status"],
    ruleConflict: row.rule_conflict,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDecision(row: DecisionRow): PermissionDecision {
  return {
    id: row.id,
    requestId: row.request_id,
    outcome: row.outcome as PermissionDecision["outcome"],
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    source: row.source as PermissionDecision["source"],
    ruleId: row.rule_id ?? undefined,
    note: row.note ?? undefined,
  };
}

function rowToRule(row: RuleRow): PermissionRule {
  return {
    id: row.id,
    name: row.name,
    category: row.category as PermissionRule["category"],
    outcome: row.outcome as PermissionRule["outcome"],
    weekdays: JSON.parse(row.weekdays) as number[],
    localStartTime: row.local_start_time ?? undefined,
    localEndTime: row.local_end_time ?? undefined,
    activeFrom: row.active_from ?? undefined,
    activeUntil: row.active_until ?? undefined,
    priority: row.priority,
    active: row.active === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Permission queue + standing rules.
 *
 * Requests are append-only: every decision (manual, standing-rule, reopen)
 * becomes a new `permission_decisions` row and reopens never erase history.
 * `create` runs the pure rules engine against the dashboard timezone and
 * auto-decides when the top-priority matching tier agrees. All server-side
 * timestamps come from the injectable clock so tests can pin time.
 */
export class PermissionRepository {
  constructor(
    private db: Database,
    private household: HouseholdRepository,
    private settings: SettingsStore,
    private clock: Clock = new RealClock(),
  ) {}

  /** Create a request, auto-deciding via standing rules when they agree. */
  create(input: PermissionRequestInput): PermissionRequestWithDecisions {
    const now = this.clock.nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO permission_requests
           (id, child_id, category, question, occurs_at, expires_at, status, rule_conflict,
            created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?)`,
      )
      .run(
        id,
        input.childId,
        input.category,
        input.question,
        input.occursAt ?? null,
        input.expiresAt ?? null,
        input.createdBy,
        now,
        now,
      );

    const evaluation = evaluateRules(input, this.listRules(), {
      now: this.clock.now(),
      timezone: this.settings.get().timezone,
    });

    if (evaluation.decision !== null) {
      const ruleId = evaluation.ruleId;
      if (ruleId !== undefined) {
        this.insertDecision({
          requestId: id,
          outcome: evaluation.decision,
          decidedBy: "system",
          source: "standing-rule",
          decidedAt: now,
          ruleId,
        });
        this.db
          .prepare(
            `UPDATE permission_requests SET status = ?, rule_conflict = NULL, updated_at = ? WHERE id = ?`,
          )
          .run(evaluation.decision, now, id);
      }
    } else if (evaluation.conflict !== undefined) {
      // Withhold the decision: an adult must break the tie.
      this.db
        .prepare(`UPDATE permission_requests SET rule_conflict = ?, updated_at = ? WHERE id = ?`)
        .run(evaluation.conflict, now, id);
    }

    eventHub.emit(Events.permissionChanged, { action: "created", requestId: id });
    return this.getWithDecisions(id)!;
  }

  /**
   * The review queue. Lazily expires pending requests past their expiresAt,
   * then returns pending requests (oldest first) plus the latest 20 decided
   * requests with their full decision history.
   */
  queue(): PermissionQueueResponse {
    const now = this.clock.nowIso();
    const expired = this.db
      .prepare(
        `UPDATE permission_requests
         SET status = 'expired', updated_at = ?
         WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?`,
      )
      .run(now, now);
    if (expired.changes > 0) {
      eventHub.emit(Events.permissionChanged, { action: "expired", count: expired.changes });
    }

    const pendingRows = this.db
      .prepare(`SELECT * FROM permission_requests WHERE status = 'pending' ORDER BY created_at ASC`)
      .all() as unknown as RequestRow[];
    const recentRows = this.db
      .prepare(
        `SELECT * FROM permission_requests
         WHERE status <> 'pending' ORDER BY updated_at DESC, created_at DESC LIMIT 20`,
      )
      .all() as unknown as RequestRow[];

    const decisionsByRequest = this.decisionsFor(recentRows.map((row) => row.id));
    return {
      pending: pendingRows.map(rowToRequest),
      recent: recentRows.map((row) => ({
        ...rowToRequest(row),
        decisions: decisionsByRequest.get(row.id) ?? [],
      })),
    };
  }

  get(id: string): PermissionRequest | undefined {
    const row = this.db
      .prepare(`SELECT * FROM permission_requests WHERE id = ?`)
      .get(id) as unknown as RequestRow | undefined;
    return row === undefined ? undefined : rowToRequest(row);
  }

  getWithDecisions(id: string): PermissionRequestWithDecisions | undefined {
    const row = this.db
      .prepare(`SELECT * FROM permission_requests WHERE id = ?`)
      .get(id) as unknown as RequestRow | undefined;
    if (row === undefined) return undefined;
    return { ...rowToRequest(row), decisions: this.decisionsFor([id]).get(id) ?? [] };
  }

  /** Adult-only manual decision on a pending request. */
  decide(id: string, input: PermissionDecisionInput): PermissionRequestWithDecisions | undefined {
    this.household.assertAdult(input.actorId);
    const existing = this.getWithDecisions(id);
    if (existing === undefined) return undefined;

    const now = this.clock.nowIso();
    const expired =
      existing.status === "expired" ||
      (existing.expiresAt !== undefined && existing.expiresAt < now);
    if (expired) {
      throw new ConflictError("request expired; reopen it before deciding");
    }
    const alreadyDecided = existing.decisions.some(
      (decision) => decision.outcome === "approved" || decision.outcome === "denied",
    );
    if (alreadyDecided) {
      throw new ConflictError("request already decided");
    }

    this.insertDecision({
      requestId: id,
      outcome: input.outcome,
      decidedBy: input.actorId,
      source: "manual",
      decidedAt: now,
      note: input.note,
    });
    this.db
      .prepare(`UPDATE permission_requests SET status = ?, updated_at = ? WHERE id = ?`)
      .run(input.outcome, now, id);

    eventHub.emit(Events.permissionChanged, { action: "decided", requestId: id });
    return this.getWithDecisions(id)!;
  }

  /**
   * Adult-only reopen: back to pending for a fresh human decision. The stale
   * expiry (if any) is cleared — a reopened request has no deadline — and all
   * prior decisions are preserved in the append-only history.
   */
  reopen(id: string, input: PermissionReopenInput): PermissionRequestWithDecisions | undefined {
    this.household.assertAdult(input.actorId);
    if (this.get(id) === undefined) return undefined;

    const now = this.clock.nowIso();
    this.insertDecision({
      requestId: id,
      outcome: "reopened",
      decidedBy: input.actorId,
      source: "manual",
      decidedAt: now,
      note: input.reason,
    });
    this.db
      .prepare(
        `UPDATE permission_requests
         SET status = 'pending', rule_conflict = NULL, expires_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(now, id);

    eventHub.emit(Events.permissionChanged, { action: "reopened", requestId: id });
    return this.getWithDecisions(id)!;
  }

  listRules(): PermissionRule[] {
    const rows = this.db
      .prepare(`SELECT * FROM permission_rules ORDER BY priority DESC, created_at ASC`)
      .all() as unknown as RuleRow[];
    return rows.map(rowToRule);
  }

  getRule(id: string): PermissionRule | undefined {
    const row = this.db
      .prepare(`SELECT * FROM permission_rules WHERE id = ?`)
      .get(id) as unknown as RuleRow | undefined;
    return row === undefined ? undefined : rowToRule(row);
  }

  /** Adult-only rule creation. */
  createRule(input: PermissionRuleInput): PermissionRule {
    this.household.assertAdult(input.actorId);
    const now = this.clock.nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO permission_rules
           (id, name, category, outcome, weekdays, local_start_time, local_end_time,
            active_from, active_until, priority, active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.category,
        input.outcome,
        JSON.stringify([...input.weekdays].sort((a, b) => a - b)),
        input.localStartTime ?? null,
        input.localEndTime ?? null,
        input.activeFrom ?? null,
        input.activeUntil ?? null,
        input.priority,
        input.active ? 1 : 0,
        input.actorId,
        now,
        now,
      );

    eventHub.emit(Events.permissionChanged, { action: "rule-created", ruleId: id });
    return this.getRule(id)!;
  }

  /** Adult-only full update of a rule. */
  updateRule(id: string, input: PermissionRuleInput): PermissionRule | undefined {
    this.household.assertAdult(input.actorId);
    const existing = this.getRule(id);
    if (existing === undefined) return undefined;

    const now = this.clock.nowIso();
    this.db
      .prepare(
        `UPDATE permission_rules
         SET name = ?, category = ?, outcome = ?, weekdays = ?, local_start_time = ?,
             local_end_time = ?, active_from = ?, active_until = ?, priority = ?,
             active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.category,
        input.outcome,
        JSON.stringify([...input.weekdays].sort((a, b) => a - b)),
        input.localStartTime ?? null,
        input.localEndTime ?? null,
        input.activeFrom ?? null,
        input.activeUntil ?? null,
        input.priority,
        input.active ? 1 : 0,
        now,
        id,
      );

    eventHub.emit(Events.permissionChanged, { action: "rule-updated", ruleId: id });
    return this.getRule(id)!;
  }

  /** Soft disable — rule rows are never deleted, so history stays explainable. */
  deleteRule(id: string): PermissionRule | undefined {
    const existing = this.getRule(id);
    if (existing === undefined) return undefined;

    this.db
      .prepare(`UPDATE permission_rules SET active = 0, updated_at = ? WHERE id = ?`)
      .run(this.clock.nowIso(), id);

    eventHub.emit(Events.permissionChanged, { action: "rule-disabled", ruleId: id });
    return this.getRule(id)!;
  }

  private insertDecision(decision: {
    requestId: string;
    outcome: "approved" | "denied" | "reopened";
    decidedBy: string;
    source: "manual" | "standing-rule";
    decidedAt: string;
    ruleId?: string;
    note?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO permission_decisions
           (id, request_id, outcome, decided_by, decided_at, source, rule_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        decision.requestId,
        decision.outcome,
        decision.decidedBy,
        decision.decidedAt,
        decision.source,
        decision.ruleId ?? null,
        decision.note ?? null,
      );
  }

  /** Decisions for a set of requests, grouped by request id, oldest first. */
  private decisionsFor(ids: string[]): Map<string, PermissionDecision[]> {
    const grouped = new Map<string, PermissionDecision[]>();
    if (ids.length === 0) return grouped;

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT * FROM permission_decisions
         WHERE request_id IN (${placeholders}) ORDER BY decided_at ASC`,
      )
      .all(...ids) as unknown as DecisionRow[];
    for (const row of rows) {
      const parsed = rowToDecision(row);
      const list = grouped.get(parsed.requestId) ?? [];
      list.push(parsed);
      grouped.set(parsed.requestId, list);
    }
    return grouped;
  }
}
