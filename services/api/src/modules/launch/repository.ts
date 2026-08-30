import { randomUUID } from "node:crypto";
import type {
  LaunchCurrentResponse,
  LaunchRun,
  LaunchStep,
  LaunchTemplate,
  LaunchTemplateInput,
} from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";
import { RealClock, type Clock } from "../../test/testClock.js";
import { ConflictError } from "../handoffs/repository.js";
import type { HouseholdRepository } from "../household/repository.js";
import type { SettingsStore } from "../settings/routes.js";
import {
  buildDepartureAt,
  deriveStatus,
  localServiceDate,
  resolveActiveTemplate,
  weekdayOfServiceDate,
} from "./schedule.js";

/** Thrown for unknown run/step/template ids; routes map it to HTTP 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A template together with its steps, as the template CRUD endpoints return. */
export interface LaunchTemplateWithSteps extends LaunchTemplate {
  steps: LaunchStep[];
}

interface TemplateRow {
  id: string;
  child_id: string;
  name: string;
  weekdays: string;
  departure_local_time: string;
  active_window_minutes: number;
  chime_before_minutes: number;
  active: number;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  id: string;
  template_id: string;
  label: string;
  icon: string;
  sort_order: number;
  active: number;
}

interface RunRow {
  id: string;
  template_id: string;
  service_date: string;
  departure_at: string;
  status: string;
  chime_played_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): LaunchTemplate {
  return {
    id: row.id,
    childId: row.child_id,
    name: row.name,
    weekdays: JSON.parse(row.weekdays) as number[],
    departureLocalTime: row.departure_local_time,
    activeWindowMinutes: row.active_window_minutes,
    chimeBeforeMinutes: row.chime_before_minutes,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStep(row: StepRow): LaunchStep {
  return {
    id: row.id,
    templateId: row.template_id,
    label: row.label,
    icon: row.icon as LaunchStep["icon"],
    sortOrder: row.sort_order,
    active: row.active === 1,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE");
}

/**
 * Persistent launch sequences: weekday templates, one run per service date,
 * step completions, chime acknowledgment, and template CRUD.
 *
 * Runs are keyed UNIQUE(template_id, service_date) — `current()` find-or-creates
 * THE run for today, recomputing departureAt from the template on every call
 * so template edits propagate. Status is derived at read time (complete when
 * every active step has a completion; expired at departure + 15 minutes) while
 * toggles persist 'complete'/'active' and completedAt for durability.
 */
export class LaunchRepository {
  constructor(
    private db: Database,
    private household: HouseholdRepository,
    private settings: SettingsStore,
    private clock: Clock = new RealClock(),
  ) {}

  /** Current kiosk launch state, by default at the injected clock's now. */
  current(now?: Date): LaunchCurrentResponse {
    const effectiveNow = now ?? this.clock.now();
    const timezone = this.settings.get().timezone;
    const serviceDate = localServiceDate(effectiveNow, timezone);
    const nowIso = effectiveNow.toISOString();

    const template = resolveActiveTemplate(
      this.listTemplates(),
      weekdayOfServiceDate(serviceDate),
    );
    if (!template) return { run: null, template: null, steps: [], nowIso };

    const departureAt = buildDepartureAt(template.departureLocalTime, serviceDate, timezone);
    const runId = this.findOrCreateRun(template.id, serviceDate, departureAt, nowIso);
    return {
      run: this.runView(runId, effectiveNow),
      template,
      steps: this.activeSteps(template.id),
      nowIso,
    };
  }

  /** Toggle a step's completion for a run; undo when it already exists. */
  toggleStep(runId: string, stepId: string, actorId: string): LaunchRun {
    this.household.assertAdult(actorId);
    const run = this.getRunRow(runId);
    if (!run) throw new NotFoundError(`run ${runId} not found`);
    const step = this.db
      .prepare(`SELECT * FROM launch_steps WHERE id = ?`)
      .get(stepId) as unknown as StepRow | undefined;
    if (!step || step.template_id !== run.template_id) {
      throw new NotFoundError(`step ${stepId} is not part of run ${runId}'s template`);
    }

    const nowIso = this.clock.nowIso();
    const existing = this.db
      .prepare(`SELECT id FROM launch_step_completions WHERE run_id = ? AND step_id = ?`)
      .get(runId, stepId);
    if (existing) {
      this.db
        .prepare(`DELETE FROM launch_step_completions WHERE run_id = ? AND step_id = ?`)
        .run(runId, stepId);
      // Undo reopens a completed run (unless inactive steps leave it complete).
      if (!this.allActiveStepsCompleted(run.template_id, runId)) {
        this.db
          .prepare(`UPDATE launch_runs SET status = 'active', completed_at = NULL, updated_at = ? WHERE id = ?`)
          .run(nowIso, runId);
      }
      eventHub.emit(Events.launchChanged, { action: "step-untoggled", runId, stepId });
    } else {
      try {
        this.db
          .prepare(
            `INSERT INTO launch_step_completions (id, run_id, step_id, completed_by, completed_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(randomUUID(), runId, stepId, actorId, nowIso);
      } catch (err) {
        // UNIQUE(run_id, step_id) raced a concurrent toggle → 409.
        if (isUniqueViolation(err)) {
          throw new ConflictError("step already completed in a concurrent request");
        }
        throw err;
      }
      if (this.allActiveStepsCompleted(run.template_id, runId)) {
        this.db
          .prepare(`UPDATE launch_runs SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?`)
          .run(nowIso, nowIso, runId);
      }
      eventHub.emit(Events.launchChanged, { action: "step-toggled", runId, stepId });
    }
    return this.runView(runId, this.clock.now());
  }

  /** Acknowledge the departure chime; a second acknowledgment conflicts. */
  markChimePlayed(runId: string, _actorId?: string): LaunchRun {
    const run = this.getRunRow(runId);
    if (!run) throw new NotFoundError(`run ${runId} not found`);
    const nowIso = this.clock.nowIso();
    const result = this.db
      .prepare(
        `UPDATE launch_runs SET chime_played_at = ?, updated_at = ?
         WHERE id = ? AND chime_played_at IS NULL`,
      )
      .run(nowIso, nowIso, runId);
    if (result.changes === 0) throw new ConflictError("chime already acknowledged for this run");
    eventHub.emit(Events.launchChanged, { action: "chime-played", runId });
    return this.runView(runId, this.clock.now());
  }

  /** Clear every trace of progress on a run; adults only. */
  reset(runId: string, actorId: string): LaunchRun {
    this.household.assertAdult(actorId);
    const run = this.getRunRow(runId);
    if (!run) throw new NotFoundError(`run ${runId} not found`);
    const nowIso = this.clock.nowIso();
    this.db.prepare(`DELETE FROM launch_step_completions WHERE run_id = ?`).run(runId);
    this.db
      .prepare(
        `UPDATE launch_runs SET status = 'active', chime_played_at = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(nowIso, runId);
    eventHub.emit(Events.launchChanged, { action: "reset", runId });
    return this.runView(runId, this.clock.now());
  }

  /** All templates with their steps (active and inactive), board order. */
  listTemplates(): LaunchTemplateWithSteps[] {
    const rows = this.db
      .prepare(`SELECT * FROM launch_templates ORDER BY created_at ASC, id ASC`)
      .all() as unknown as TemplateRow[];
    return rows.map((row) => ({ ...rowToTemplate(row), steps: this.steps(row.id) }));
  }

  /** Adult-only template creation, optionally with its steps in one call. */
  createTemplate(input: LaunchTemplateInput, actorId: string): LaunchTemplateWithSteps {
    this.household.assertAdult(actorId);
    const id = randomUUID();
    const nowIso = this.clock.nowIso();
    this.db
      .prepare(
        `INSERT INTO launch_templates
           (id, child_id, name, weekdays, departure_local_time, active_window_minutes,
            chime_before_minutes, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.childId,
        input.name,
        JSON.stringify(input.weekdays),
        input.departureLocalTime,
        input.activeWindowMinutes ?? 45,
        input.chimeBeforeMinutes ?? 3,
        input.active ? 1 : 0,
        nowIso,
        nowIso,
      );
    for (const step of input.steps ?? []) {
      this.insertStep(id, step);
    }
    eventHub.emit(Events.launchChanged, { action: "template-created", templateId: id });
    return this.getTemplate(id)!;
  }

  /** Adult-only template update; input.steps replaces the step set when provided. */
  updateTemplate(
    id: string,
    input: LaunchTemplateInput,
    actorId: string,
  ): LaunchTemplateWithSteps {
    this.household.assertAdult(actorId);
    const existing = this.getTemplate(id);
    if (!existing) throw new NotFoundError(`template ${id} not found`);
    const nowIso = this.clock.nowIso();
    this.db
      .prepare(
        `UPDATE launch_templates
         SET child_id = ?, name = ?, weekdays = ?, departure_local_time = ?,
             active_window_minutes = ?, chime_before_minutes = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.childId,
        input.name,
        JSON.stringify(input.weekdays),
        input.departureLocalTime,
        input.activeWindowMinutes ?? existing.activeWindowMinutes,
        input.chimeBeforeMinutes ?? existing.chimeBeforeMinutes,
        input.active ? 1 : 0,
        nowIso,
        id,
      );
    if (input.steps !== undefined) {
      // Replace the step set: old steps disappear, and completions pointing at
      // them are dropped so completedStepIds never lists dead steps.
      const oldStepIds = this.steps(id).map((s) => s.id);
      this.db.prepare(`DELETE FROM launch_steps WHERE template_id = ?`).run(id);
      if (oldStepIds.length > 0) {
        const placeholders = oldStepIds.map(() => "?").join(", ");
        this.db
          .prepare(`DELETE FROM launch_step_completions WHERE step_id IN (${placeholders})`)
          .run(...oldStepIds);
      }
      for (const step of input.steps) {
        this.insertStep(id, step);
      }
    }
    eventHub.emit(Events.launchChanged, { action: "template-updated", templateId: id });
    return this.getTemplate(id)!;
  }

  /** Find-or-create THE run for (templateId, serviceDate); refreshes stored departure. */
  private findOrCreateRun(
    templateId: string,
    serviceDate: string,
    departureAt: string,
    nowIso: string,
  ): string {
    const existing = this.db
      .prepare(`SELECT id, departure_at FROM launch_runs WHERE template_id = ? AND service_date = ?`)
      .get(templateId, serviceDate) as unknown as { id: string; departure_at: string } | undefined;
    if (existing) {
      // departureAt is recomputed every call; template edits land here.
      if (existing.departure_at !== departureAt) {
        this.db
          .prepare(`UPDATE launch_runs SET departure_at = ?, updated_at = ? WHERE id = ?`)
          .run(departureAt, nowIso, existing.id);
      }
      return existing.id;
    }

    const id = randomUUID();
    try {
      this.db
        .prepare(
          `INSERT INTO launch_runs
             (id, template_id, service_date, departure_at, status, chime_played_at, completed_at,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
        )
        .run(id, templateId, serviceDate, departureAt, nowIso, nowIso);
      return id;
    } catch (err) {
      // UNIQUE(template_id, service_date) raced another writer — reuse their row.
      if (!isUniqueViolation(err)) throw err;
      const raced = this.db
        .prepare(`SELECT id FROM launch_runs WHERE template_id = ? AND service_date = ?`)
        .get(templateId, serviceDate) as unknown as { id: string } | undefined;
      if (!raced) throw err;
      return raced.id;
    }
  }

  /** Contract view of a run: completions, derived status, durable timestamps. */
  private runView(runId: string, now: Date): LaunchRun {
    const row = this.getRunRow(runId)!;
    const completedStepIds = this.completedStepIds(runId);
    const status = deriveStatus(
      { departureAt: row.departure_at },
      this.activeSteps(row.template_id),
      completedStepIds,
      now,
    );
    return {
      id: row.id,
      templateId: row.template_id,
      serviceDate: row.service_date,
      departureAt: row.departure_at,
      status,
      completedStepIds,
      chimePlayedAt: row.chime_played_at,
      completedAt: row.completed_at,
    };
  }

  private allActiveStepsCompleted(templateId: string, runId: string): boolean {
    const activeSteps = this.activeSteps(templateId);
    if (activeSteps.length === 0) return false;
    const done = new Set(this.completedStepIds(runId));
    return activeSteps.every((s) => done.has(s.id));
  }

  private getRunRow(runId: string): RunRow | undefined {
    return this.db
      .prepare(`SELECT * FROM launch_runs WHERE id = ?`)
      .get(runId) as unknown as RunRow | undefined;
  }

  private getTemplate(id: string): LaunchTemplateWithSteps | undefined {
    const row = this.db
      .prepare(`SELECT * FROM launch_templates WHERE id = ?`)
      .get(id) as unknown as TemplateRow | undefined;
    return row ? { ...rowToTemplate(row), steps: this.steps(row.id) } : undefined;
  }

  /** Every step of a template, checklist order (active flags intact). */
  private steps(templateId: string): LaunchStep[] {
    const rows = this.db
      .prepare(`SELECT * FROM launch_steps WHERE template_id = ? ORDER BY sort_order ASC, id ASC`)
      .all(templateId) as unknown as StepRow[];
    return rows.map(rowToStep);
  }

  private activeSteps(templateId: string): LaunchStep[] {
    return this.steps(templateId).filter((s) => s.active);
  }

  private completedStepIds(runId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT step_id FROM launch_step_completions WHERE run_id = ?
         ORDER BY completed_at ASC, rowid ASC`,
      )
      .all(runId) as unknown as { step_id: string }[];
    return rows.map((r) => r.step_id);
  }

  private insertStep(templateId: string, step: { label: string; icon: string; sortOrder?: number; active?: boolean }): void {
    this.db
      .prepare(
        `INSERT INTO launch_steps (id, template_id, label, icon, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), templateId, step.label, step.icon, step.sortOrder ?? 0, (step.active ?? true) ? 1 : 0);
  }
}
