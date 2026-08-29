import { randomUUID } from "node:crypto";
import type {
  BackupContact,
  BackupContactInput,
  HandoffBackupInput,
  HandoffBoardItem,
  HandoffBoardResponse,
  HandoffCreateInput,
  HandoffObligation,
  HouseholdMember,
} from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";
import type { CalendarRepository } from "../calendar/repository.js";
import type { HouseholdRepository } from "../household/repository.js";
import { RoleError } from "../household/repository.js";
import type { SettingsStore } from "../settings/routes.js";
import { buildBoardItems, type ConflictEvent } from "./conflicts.js";

/** Thrown when a mutation hits stale state (e.g. concurrent claims). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

interface ObligationRow {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  assignee_member_id: string | null;
  backup_contact_id: string | null;
  note: string | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  priority: number;
  active: number;
  notes: string | null;
}

function rowToObligation(row: ObligationRow): HandoffObligation {
  return {
    id: row.id,
    eventId: row.event_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as HandoffObligation["status"],
    assigneeMemberId: row.assignee_member_id ?? undefined,
    backupContactId: row.backup_contact_id ?? undefined,
    note: row.note ?? undefined,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToContact(row: ContactRow): BackupContact {
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    phone: row.phone,
    priority: row.priority,
    active: row.active === 1,
    notes: row.notes ?? undefined,
  };
}

export class HandoffRepository {
  constructor(
    private db: Database,
    private calendar: CalendarRepository,
    private household: HouseholdRepository,
    private settings: SettingsStore,
  ) {}

  /** Board for a window, assembled with the (optionally injected) clock. */
  board(from: string, to: string, now: Date = new Date()): HandoffBoardResponse {
    const settings = this.settings.get();
    const inputs = {
      now,
      timezone: settings.timezone,
      travelBufferMinutes: settings.family.travelBufferMinutes,
      overrunBufferMinutes: settings.family.overrunBufferMinutes,
      handoffAlertTime: settings.family.handoffAlertTime,
    };

    const rows = this.db
      .prepare(
        `SELECT * FROM handoff_obligations
         WHERE starts_at < ? AND ends_at > ?
         ORDER BY starts_at ASC`,
      )
      .all(to, from) as unknown as ObligationRow[];
    const obligations = rows.map(rowToObligation);

    // Calendar events overlapping the window (expanded occurrences included);
    // a small pad on both sides covers buffered intervals.
    const padMs = (inputs.travelBufferMinutes + inputs.overrunBufferMinutes) * 60_000;
    const events: ConflictEvent[] = this.calendar
      .list(
        new Date(new Date(from).getTime() - padMs).toISOString(),
        new Date(new Date(to).getTime() + padMs).toISOString(),
      )
      .map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        ownerId: e.ownerId,
        scheduleKind: e.scheduleKind,
      }));

    const members: HouseholdMember[] = this.household.list();
    const contacts = this.listContacts();

    const items: HandoffBoardItem[] = buildBoardItems(
      obligations,
      events,
      members,
      inputs,
      contacts,
    );
    return { items, from, to };
  }

  /** Create (or idempotently update) an obligation for an event. */
  create(input: HandoffCreateInput): HandoffObligation {
    this.household.assertAdult(input.actorId);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO handoff_obligations
           (id, event_id, starts_at, ends_at, status, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'unclaimed', ?, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .run(randomUUID(), input.eventId, input.startsAt, input.endsAt, input.actorId, now, now);
    eventHub.emit(Events.handoffChanged, { action: "created", eventId: input.eventId });
    return this.getByEventId(input.eventId)!;
  }

  claim(id: string, actorId: string): HandoffObligation {
    this.household.assertAdult(actorId);
    const existing = this.get(id);
    if (!existing) throw new ConflictError("handoff not found");
    if (existing.status === "claimed" && existing.assigneeMemberId !== actorId) {
      throw new ConflictError(`already claimed by ${existing.assigneeMemberId}`);
    }
    if (existing.status === "resolved") {
      throw new ConflictError("handoff already resolved");
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE handoff_obligations
         SET status = 'claimed', assignee_member_id = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(actorId, actorId, now, id);
    eventHub.emit(Events.handoffChanged, { action: "claimed", id });
    return this.get(id)!;
  }

  requestBackup(id: string, input: HandoffBackupInput): HandoffObligation {
    this.household.assertAdult(input.actorId);
    const existing = this.get(id);
    if (!existing) throw new ConflictError("handoff not found");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE handoff_obligations
         SET status = 'backup-requested',
             backup_contact_id = COALESCE(?, backup_contact_id),
             note = COALESCE(?, note),
             updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.backupContactId ?? null, input.note ?? null, input.actorId, now, id);
    eventHub.emit(Events.handoffChanged, { action: "backup-requested", id });
    return this.get(id)!;
  }

  resolve(id: string, actorId: string): HandoffObligation {
    this.household.assertAdult(actorId);
    const existing = this.get(id);
    if (!existing) throw new ConflictError("handoff not found");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE handoff_obligations
         SET status = 'resolved', updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(actorId, now, id);
    eventHub.emit(Events.handoffChanged, { action: "resolved", id });
    return this.get(id)!;
  }

  get(id: string): HandoffObligation | undefined {
    const row = this.db
      .prepare(`SELECT * FROM handoff_obligations WHERE id = ?`)
      .get(id) as unknown as ObligationRow | undefined;
    return row ? rowToObligation(row) : undefined;
  }

  getByEventId(eventId: string): HandoffObligation | undefined {
    const row = this.db
      .prepare(`SELECT * FROM handoff_obligations WHERE event_id = ?`)
      .get(eventId) as unknown as ObligationRow | undefined;
    return row ? rowToObligation(row) : undefined;
  }

  listContacts(): BackupContact[] {
    const rows = this.db
      .prepare(`SELECT * FROM backup_contacts ORDER BY priority ASC, name ASC`)
      .all() as unknown as ContactRow[];
    return rows.map(rowToContact);
  }

  createContact(input: BackupContactInput): BackupContact {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO backup_contacts (id, name, relationship, phone, priority, active, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.relationship, input.phone, input.priority, input.active ? 1 : 0, input.notes ?? null);
    eventHub.emit(Events.handoffChanged, { action: "contact-created", id });
    return rowToContact(
      this.db.prepare(`SELECT * FROM backup_contacts WHERE id = ?`).get(id) as unknown as ContactRow,
    );
  }

  updateContact(id: string, input: BackupContactInput): BackupContact | undefined {
    const row = this.db.prepare(`SELECT * FROM backup_contacts WHERE id = ?`).get(id) as unknown as ContactRow | undefined;
    if (!row) return undefined;
    this.db
      .prepare(
        `UPDATE backup_contacts
         SET name = ?, relationship = ?, phone = ?, priority = ?, active = ?, notes = ?
         WHERE id = ?`,
      )
      .run(input.name, input.relationship, input.phone, input.priority, input.active ? 1 : 0, input.notes ?? null, id);
    eventHub.emit(Events.handoffChanged, { action: "contact-updated", id });
    return rowToContact(
      this.db.prepare(`SELECT * FROM backup_contacts WHERE id = ?`).get(id) as unknown as ContactRow,
    );
  }
}

export { RoleError };
