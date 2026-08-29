import { randomUUID } from "node:crypto";
import type {
  CalendarEvent,
  CalendarEventInput,
  RecurrenceRule,
} from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";

interface EventRow {
  id: string;
  calendar_id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: number;
  location: string | null;
  notes: string | null;
  color: string;
  recurrence: string;
  reminders: string;
  created_at: string;
  updated_at: string;
}

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    start: row.start_at,
    end: row.end_at,
    allDay: row.all_day === 1,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    color: (row.color as CalendarEvent["color"]) ?? "sky",
    recurrence: JSON.parse(row.recurrence) as RecurrenceRule,
    reminders: JSON.parse(row.reminders),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToRow(input: CalendarEventInput, now: string, id: string = randomUUID()) {
  return {
    id,
    calendar_id: input.calendarId ?? "local",
    title: input.title,
    start_at: input.start,
    end_at: input.end,
    all_day: input.allDay ? 1 : 0,
    location: input.location ?? null,
    notes: input.notes ?? null,
    color: input.color ?? "sky",
    recurrence: JSON.stringify(input.recurrence ?? { frequency: "none", interval: 1 }),
    reminders: JSON.stringify(input.reminders ?? []),
    created_at: now,
    updated_at: now,
  };
}

const DAY_MS = 86_400_000;

/** Expand a recurrence rule into concrete occurrences between start and end. */
function expandOccurrences(
  base: CalendarEvent,
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date,
  max = 500,
): CalendarEvent[] {
  if (rule.frequency === "none") return [];
  const out: CalendarEvent[] = [];
  const start = new Date(base.start);
  const duration = new Date(base.end).getTime() - start.getTime();
  // Skip the base occurrence (already returned as the stored event) and start
  // expanding from the first recurrence.
  let cursor = step(start, rule);
  let count = 0;

  while (cursor.getTime() <= rangeEnd.getTime() && count < max) {
    if (cursor.getTime() >= rangeStart.getTime()) {
      out.push({
        ...base,
        id: `${base.id}#${cursor.toISOString()}`,
        start: cursor.toISOString(),
        end: new Date(cursor.getTime() + duration).toISOString(),
      });
    }
    count++;
    cursor = step(cursor, rule);
    if (rule.until && cursor.getTime() > new Date(rule.until).getTime()) break;
  }
  return out;
}

function step(date: Date, rule: RecurrenceRule): Date {
  const d = new Date(date);
  const interval = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case "daily":
      d.setDate(d.getDate() + interval);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7 * interval);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + interval);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }
  return d;
}

export class CalendarRepository {
  constructor(private db: Database) {}

  list(start: string, end: string): CalendarEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM calendar_events
         WHERE start_at < ? AND end_at > ?
         ORDER BY start_at ASC`,
      )
      .all(end, start) as unknown as EventRow[];

    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    const events: CalendarEvent[] = [];
    for (const row of rows) {
      const event = rowToEvent(row);
      events.push(event);
      events.push(...expandOccurrences(event, event.recurrence, rangeStart, rangeEnd));
    }
    return events;
  }

  get(id: string): CalendarEvent | undefined {
    const row = this.db
      .prepare(`SELECT * FROM calendar_events WHERE id = ?`)
      .get(id) as unknown as EventRow | undefined;
    return row ? rowToEvent(row) : undefined;
  }

  create(input: CalendarEventInput): CalendarEvent {
    const now = new Date().toISOString();
    const row = inputToRow(input, now);
    this.db
      .prepare(
        `INSERT INTO calendar_events
         (id, calendar_id, title, start_at, end_at, all_day, location, notes, color, recurrence, reminders, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.calendar_id,
        row.title,
        row.start_at,
        row.end_at,
        row.all_day,
        row.location,
        row.notes,
        row.color,
        row.recurrence,
        row.reminders,
        row.created_at,
        row.updated_at,
      );
    this.logActivity("event-upcoming", input.title, input.start, input.title);
    eventHub.emit(Events.calendarChanged, { action: "created", id: row.id });
    return this.get(row.id)!;
  }

  update(id: string, input: CalendarEventInput): CalendarEvent | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const row = inputToRow(input, new Date().toISOString(), id);
    this.db
      .prepare(
        `UPDATE calendar_events SET
           calendar_id=?, title=?, start_at=?, end_at=?, all_day=?, location=?,
           notes=?, color=?, recurrence=?, reminders=?, updated_at=?
         WHERE id=?`,
      )
      .run(
        row.calendar_id,
        row.title,
        row.start_at,
        row.end_at,
        row.all_day,
        row.location,
        row.notes,
        row.color,
        row.recurrence,
        row.reminders,
        row.updated_at,
        id,
      );
    eventHub.emit(Events.calendarChanged, { action: "updated", id });
    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
    if (result.changes > 0) {
      eventHub.emit(Events.calendarChanged, { action: "deleted", id });
      return true;
    }
    return false;
  }

  private logActivity(kind: string, title: string, at: string, ref?: string): void {
    this.db
      .prepare(
        `INSERT INTO activity_log (kind, title, at, ref) VALUES (?, ?, ?, ?)`,
      )
      .run(kind, title, at, ref ?? null);
  }
}
