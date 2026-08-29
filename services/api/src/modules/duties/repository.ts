import { randomUUID } from "node:crypto";
import type {
  DutyDefinition,
  DutyDefinitionInput,
  DutyEntryInput,
  DutyEntryView,
  DutySummary,
  DutyTally,
} from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";
import { RealClock, type Clock } from "../../test/testClock.js";
import { ConflictError } from "../handoffs/repository.js";
import type { HouseholdRepository } from "../household/repository.js";
import type { SettingsStore } from "../settings/routes.js";

const DAY_MS = 86_400_000;
const RECENT_ENTRIES_LIMIT = 12;

interface DefinitionRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
}

interface EntryRow {
  id: string;
  duty_id: string;
  performed_by: string;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

function rowToDefinition(row: DefinitionRow): DutyDefinition {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon as DutyDefinition["icon"],
    color: row.color as DutyDefinition["color"],
    sortOrder: row.sort_order,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEntry(row: EntryRow): DutyEntryView {
  return {
    id: row.id,
    dutyId: row.duty_id,
    performedBy: row.performed_by,
    occurredAt: row.occurred_at,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    dutyName: "",
    performerName: "",
  };
}

/**
 * Adult duty ledger.
 *
 * Entries are quick-logs: an adult taps a duty card and the row is stamped
 * with the server clock. Only adults can hold duty credit — `logEntry`
 * asserts the performer's role at write time, so child rows can never exist
 * and every count in the summary is adult credit by construction. Undo is
 * deliberately narrow: only a duty's LATEST entry can be withdrawn (a
 * fat-fingered tap), which keeps history honest.
 */
export class DutyRepository {
  constructor(
    private db: Database,
    private household: HouseholdRepository,
    private settings: SettingsStore,
    private clock: Clock = new RealClock(),
  ) {}

  /**
   * Rolling-window rollup. `windowDays` defaults to the family setting;
   * counts and the most-recent/streak facts cover the window, while
   * `recentEntries` is the last 12 entries overall.
   */
  summary(windowDays?: number): DutySummary {
    const days = windowDays ?? this.settings.get().family.dutyWindowDays;
    const nowMs = this.clock.now().getTime();
    const windowStart = new Date(nowMs - days * DAY_MS).toISOString();
    const windowEnd = new Date(nowMs).toISOString();

    const adults = this.household.list().filter((m) => m.role === "adult" && m.active);
    const activeDuties = this.listDefinitions().filter((d) => d.active);

    // Window rows, newest first (ISO strings sort chronologically).
    const windowedRows = this.db
      .prepare(
        `SELECT * FROM duty_entries
         WHERE occurred_at >= ? AND occurred_at <= ?
         ORDER BY occurred_at DESC, created_at DESC`,
      )
      .all(windowStart, windowEnd) as unknown as EntryRow[];

    const duties: DutyTally[] = activeDuties.map((duty) => {
      const rows = windowedRows.filter((row) => row.duty_id === duty.id);

      // Per-adult counts, in household order; adults with no entries omitted.
      const countByMember = new Map<string, number>();
      for (const row of rows) {
        countByMember.set(row.performed_by, (countByMember.get(row.performed_by) ?? 0) + 1);
      }
      const counts = adults
        .filter((adult) => countByMember.has(adult.id))
        .map((adult) => ({
          memberId: adult.id,
          displayName: adult.displayName,
          count: countByMember.get(adult.id)!,
        }));

      const latest = rows[0];
      const mostRecentMemberId = latest?.performed_by ?? null;
      const mostRecentAt = latest?.occurred_at ?? null;

      // Streak: consecutive same-performer entries from the newest.
      let streak = null;
      if (latest) {
        let consecutive = 0;
        for (const row of rows) {
          if (row.performed_by !== latest.performed_by) break;
          consecutive += 1;
        }
        streak = {
          memberId: latest.performed_by,
          displayName: adults.find((a) => a.id === latest.performed_by)?.displayName ?? "Adult",
          count: consecutive,
        };
      }

      return {
        dutyId: duty.id,
        name: duty.name,
        icon: duty.icon,
        color: duty.color,
        counts,
        mostRecentMemberId,
        mostRecentAt,
        streak,
      };
    });

    const recentRows = this.db
      .prepare(
        `SELECT * FROM duty_entries
         ORDER BY occurred_at DESC, created_at DESC
         LIMIT ?`,
      )
      .all(RECENT_ENTRIES_LIMIT) as unknown as EntryRow[];
    const recentEntries = recentRows.map((row) => this.enrich(rowToEntry(row)));

    return { windowStart, windowEnd, duties, recentEntries };
  }

  /** Quick-log a duty as an adult performer; stamps the server clock. */
  logEntry(input: DutyEntryInput): DutyEntryView {
    this.household.assertAdult(input.performedBy);
    const id = randomUUID();
    const now = this.clock.nowIso();
    this.db
      .prepare(
        `INSERT INTO duty_entries (id, duty_id, performed_by, occurred_at, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.dutyId, input.performedBy, now, input.note ?? null, now);
    eventHub.emit(Events.dutyChanged, { action: "logged", entryId: id, dutyId: input.dutyId });
    return this.getEntry(id)!;
  }

  /** Withdraw the latest entry of a duty. Older entries → ConflictError. */
  undoEntry(id: string, actorId: string): DutyEntryView | undefined {
    this.household.assertAdult(actorId);
    const entry = this.getEntry(id);
    if (entry === undefined) return undefined;

    const latest = this.db
      .prepare(
        `SELECT id FROM duty_entries WHERE duty_id = ?
         ORDER BY occurred_at DESC, created_at DESC LIMIT 1`,
      )
      .get(entry.dutyId) as unknown as { id: string } | undefined;
    if (latest?.id !== id) {
      throw new ConflictError("only the latest entry of a duty can be undone");
    }

    this.db.prepare(`DELETE FROM duty_entries WHERE id = ?`).run(id);
    eventHub.emit(Events.dutyChanged, { action: "undone", entryId: id, dutyId: entry.dutyId });
    return entry;
  }

  getEntry(id: string): DutyEntryView | undefined {
    const row = this.db
      .prepare(`SELECT * FROM duty_entries WHERE id = ?`)
      .get(id) as unknown as EntryRow | undefined;
    return row === undefined ? undefined : this.enrich(rowToEntry(row));
  }

  /** All duty definitions (active and inactive), board order. */
  listDefinitions(): DutyDefinition[] {
    const rows = this.db
      .prepare(`SELECT * FROM duty_definitions ORDER BY sort_order ASC, created_at ASC`)
      .all() as unknown as DefinitionRow[];
    return rows.map(rowToDefinition);
  }

  getDefinition(id: string): DutyDefinition | undefined {
    const row = this.db
      .prepare(`SELECT * FROM duty_definitions WHERE id = ?`)
      .get(id) as unknown as DefinitionRow | undefined;
    return row === undefined ? undefined : rowToDefinition(row);
  }

  /** Adult-only definition creation. */
  createDefinition(input: DutyDefinitionInput, actorId: string): DutyDefinition {
    this.household.assertAdult(actorId);
    const id = randomUUID();
    const now = this.clock.nowIso();
    this.db
      .prepare(
        `INSERT INTO duty_definitions (id, name, icon, color, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.icon, input.color, input.sortOrder, input.active ? 1 : 0, now, now);
    eventHub.emit(Events.dutyChanged, { action: "definition-created", dutyId: id });
    return this.getDefinition(id)!;
  }

  /** Adult-only definition update; undefined when the id is unknown. */
  updateDefinition(id: string, input: DutyDefinitionInput, actorId: string): DutyDefinition | undefined {
    this.household.assertAdult(actorId);
    if (this.getDefinition(id) === undefined) return undefined;
    const now = this.clock.nowIso();
    this.db
      .prepare(
        `UPDATE duty_definitions
         SET name = ?, icon = ?, color = ?, sort_order = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.name, input.icon, input.color, input.sortOrder, input.active ? 1 : 0, now, id);
    eventHub.emit(Events.dutyChanged, { action: "definition-updated", dutyId: id });
    return this.getDefinition(id)!;
  }

  /** Fill in display names for the rollup view. */
  private enrich(entry: DutyEntryView): DutyEntryView {
    return {
      ...entry,
      dutyName: this.getDefinition(entry.dutyId)?.name ?? "Duty",
      performerName:
        this.household.list().find((m) => m.id === entry.performedBy)?.displayName ?? "Member",
    };
  }
}
