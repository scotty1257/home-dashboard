import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { Database } from "./database.js";

// node:sqlite must be resolved at runtime (see database.ts for the rationale).
const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncImpl } = require("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

/** The OLD pre-migrations schema (baseline tables only), as database.ts created it inline. */
const OLD_SCHEMA = `
  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL DEFAULT 'local',
    title TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    notes TEXT,
    color TEXT NOT NULL DEFAULT 'sky',
    recurrence TEXT NOT NULL DEFAULT '{"frequency":"none","interval":1}',
    reminders TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calendar_range ON calendar_events(start_at, end_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    at TEXT NOT NULL,
    ref TEXT,
    severity TEXT NOT NULL DEFAULT 'info'
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_id TEXT,
    detail TEXT
  );
`;

const ALL_TABLES = [
  "calendar_events",
  "settings",
  "activity_log",
  "audit_log",
  "schema_migrations",
  "household_members",
  "backup_contacts",
  "handoff_obligations",
  "permission_requests",
  "permission_decisions",
  "permission_rules",
  "duty_definitions",
  "duty_entries",
  "voice_notes",
  "launch_templates",
  "launch_steps",
  "launch_runs",
  "launch_step_completions",
];

const ALL_INDEXES = [
  "idx_calendar_range",
  "idx_duties_occurred",
  "idx_voice_notes_recipient",
  "idx_handoffs_window",
  "idx_calendar_owner",
  "idx_permission_queue",
  "idx_launch_runs_date",
];

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hd-migrations-"));
  return path.join(dir, "test.db");
}

function tableNames(db: Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as { name: string }[]).map(
    (r) => r.name,
  );
}

function indexNames(db: Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as unknown as { name: string }[]).map(
    (r) => r.name,
  );
}

describe("schema migrations", () => {
  it("creates every family table, index, and seed on a fresh in-memory database", () => {
    const db = new Database(":memory:");

    const tables = tableNames(db);
    for (const table of ALL_TABLES) {
      expect(tables, `missing table ${table}`).toContain(table);
    }

    const indexes = indexNames(db);
    for (const index of ALL_INDEXES) {
      expect(indexes, `missing index ${index}`).toContain(index);
    }

    const members = db
      .prepare("SELECT id, display_name, role FROM household_members ORDER BY sort_order")
      .all() as unknown as { id: string; display_name: string; role: string }[];
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.display_name)).toEqual(["You", "Partner", "Kid"]);
    expect(members.map((m) => m.role)).toEqual(["adult", "adult", "child"]);

    const dutyCount = db.prepare("SELECT COUNT(*) AS n FROM duty_definitions").get() as unknown as { n: number };
    expect(dutyCount.n).toBe(5);

    const templates = db
      .prepare("SELECT id, name, child_id FROM launch_templates")
      .all() as unknown as { id: string; name: string; child_id: string }[];
    expect(templates).toHaveLength(1);
    expect(templates[0]?.id).toBe("launch-weekday");
    expect(templates[0]?.name).toBe("Weekday launch");
    expect(templates[0]?.child_id).toBe("member-kid");

    const steps = db
      .prepare("SELECT label FROM launch_steps ORDER BY sort_order")
      .all() as unknown as { label: string }[];
    expect(steps.map((s) => s.label)).toEqual(["Shoes", "Bag", "Snack"]);

    const contacts = db.prepare("SELECT COUNT(*) AS n FROM backup_contacts").get() as unknown as { n: number };
    expect(contacts.n).toBe(0);
  });

  it("upgrades an old-schema database without losing data and adds the family columns", () => {
    const dbPath = tempDbPath();

    // Build the OLD schema by hand, exactly as pre-migration database.ts left it.
    const raw = new DatabaseSyncImpl(dbPath);
    raw.exec(OLD_SCHEMA);
    raw
      .prepare(
        `INSERT INTO calendar_events (id, calendar_id, title, start_at, end_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "evt-precious",
        "local",
        "Precious",
        "2026-08-01T10:00:00.000Z",
        "2026-08-01T11:00:00.000Z",
        "2026-08-01T09:00:00.000Z",
        "2026-08-01T09:00:00.000Z",
      );
    raw.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "theme",
      "dark",
      "2026-08-01T09:00:00.000Z",
    );
    raw.close();

    // Constructing the wrapper runs the migrations.
    const db = new Database(dbPath);

    const event = db.prepare("SELECT title FROM calendar_events WHERE id = ?").get("evt-precious") as unknown as {
      title: string;
    };
    expect(event).toEqual({ title: "Precious" });

    const setting = db.prepare("SELECT value FROM settings WHERE key = ?").get("theme") as unknown as { value: string };
    expect(setting).toEqual({ value: "dark" });

    const columns = (
      db.prepare("PRAGMA table_info(calendar_events)").all() as unknown as { name: string }[]
    ).map((c) => c.name);
    expect(columns).toContain("owner_id");
    expect(columns).toContain("schedule_kind");
    expect(columns).toContain("requires_handoff");

    const members = db
      .prepare("SELECT display_name FROM household_members ORDER BY sort_order")
      .all() as unknown as { display_name: string }[];
    expect(members.map((m) => m.display_name)).toEqual(["You", "Partner", "Kid"]);

    db.close();
  });

  it("is idempotent: a second run changes no schema_migrations rows and keeps data", () => {
    const dbPath = tempDbPath();

    const first = new Database(dbPath);
    first
      .prepare(
        `INSERT INTO calendar_events (id, calendar_id, title, start_at, end_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "evt-keep",
        "local",
        "Keep me",
        "2026-08-02T10:00:00.000Z",
        "2026-08-02T11:00:00.000Z",
        "2026-08-02T09:00:00.000Z",
        "2026-08-02T09:00:00.000Z",
      );
    const rowsBefore = first
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as unknown as { version: number; name: string }[];
    expect(rowsBefore.map((r) => r.name)).toEqual(["baseline", "family-foundation", "family-seeds"]);
    first.close();

    const second = new Database(dbPath);
    const rowsAfter = second
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as unknown as { version: number; name: string }[];
    expect(rowsAfter).toEqual(rowsBefore);

    const event = second.prepare("SELECT title FROM calendar_events WHERE id = ?").get("evt-keep") as unknown as {
      title: string;
    };
    expect(event).toEqual({ title: "Keep me" });

    const memberCount = second.prepare("SELECT COUNT(*) AS n FROM household_members").get() as unknown as { n: number };
    expect(memberCount.n).toBe(3);

    second.close();
  });

  it("enforces foreign keys on handoff assignees", () => {
    const db = new Database(":memory:");
    expect(() =>
      db
        .prepare(
          `INSERT INTO handoff_obligations
           (id, event_id, starts_at, ends_at, updated_by, created_at, updated_at, assignee_member_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "ho-1",
          "evt-1",
          "2026-08-01T10:00:00.000Z",
          "2026-08-01T11:00:00.000Z",
          "member-you",
          "2026-08-01T09:00:00.000Z",
          "2026-08-01T09:00:00.000Z",
          "member-ghost",
        ),
    ).toThrow();
  });
});
