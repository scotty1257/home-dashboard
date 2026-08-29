import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

/**
 * Versioned, idempotent schema migrations.
 *
 * Every migration runs inside its own transaction and records its version in
 * `schema_migrations` only after success. Versions already present are skipped,
 * so re-running against an existing database is a no-op. Old databases built
 * by the pre-migration inline `migrate()` are upgraded in place: the baseline
 * migration's CREATE TABLE IF NOT EXISTS statements are no-ops there, and the
 * family migration adds the new calendar columns only when missing.
 */
export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSyncType) => void;
}

/** Fixed timestamp for seeded rows so tests can detect updated_at bumps deterministically. */
const SEED_EPOCH = "2026-01-01T00:00:00.000Z";

const baseline: Migration = {
  version: 1,
  name: "baseline",
  up: (db) => {
    db.exec(`
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
    `);
  },
};

function columnNames(db: DatabaseSyncType, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

const familyFoundation: Migration = {
  version: 2,
  name: "family-foundation",
  up: (db) => {
    // Calendar columns are added conditionally: fresh databases created by the
    // baseline migration lack them, and so do pre-migration databases.
    const calendarColumns = columnNames(db, "calendar_events");
    if (!calendarColumns.has("owner_id")) {
      db.exec("ALTER TABLE calendar_events ADD COLUMN owner_id TEXT NULL;");
    }
    if (!calendarColumns.has("schedule_kind")) {
      db.exec("ALTER TABLE calendar_events ADD COLUMN schedule_kind TEXT NOT NULL DEFAULT 'general';");
    }
    if (!calendarColumns.has("requires_handoff")) {
      db.exec("ALTER TABLE calendar_events ADD COLUMN requires_handoff INTEGER NOT NULL DEFAULT 0;");
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS household_members (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backup_contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        phone TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS handoff_obligations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unclaimed',
        assignee_member_id TEXT REFERENCES household_members(id),
        backup_contact_id TEXT REFERENCES backup_contacts(id),
        note TEXT,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permission_requests (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL REFERENCES household_members(id),
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        occurs_at TEXT,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        rule_conflict TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permission_decisions (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES permission_requests(id),
        outcome TEXT NOT NULL,
        decided_by TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        source TEXT NOT NULL,
        rule_id TEXT,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS permission_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        outcome TEXT NOT NULL,
        weekdays TEXT NOT NULL,
        local_start_time TEXT,
        local_end_time TEXT,
        active_from TEXT,
        active_until TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS duty_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS duty_entries (
        id TEXT PRIMARY KEY,
        duty_id TEXT NOT NULL REFERENCES duty_definitions(id),
        performed_by TEXT NOT NULL REFERENCES household_members(id),
        occurred_at TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_notes (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL REFERENCES household_members(id),
        recipient_id TEXT NOT NULL REFERENCES household_members(id),
        in_reply_to_id TEXT,
        audio_url TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        transcript TEXT,
        created_at TEXT NOT NULL,
        read_at TEXT
      );

      CREATE TABLE IF NOT EXISTS launch_templates (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL REFERENCES household_members(id),
        name TEXT NOT NULL,
        weekdays TEXT NOT NULL,
        departure_local_time TEXT NOT NULL,
        active_window_minutes INTEGER NOT NULL DEFAULT 45,
        chime_before_minutes INTEGER NOT NULL DEFAULT 3,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS launch_steps (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES launch_templates(id),
        label TEXT NOT NULL,
        icon TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS launch_runs (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES launch_templates(id),
        service_date TEXT NOT NULL,
        departure_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        chime_played_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(template_id, service_date)
      );

      CREATE TABLE IF NOT EXISTS launch_step_completions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES launch_runs(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        completed_by TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        UNIQUE(run_id, step_id)
      );

      CREATE INDEX IF NOT EXISTS idx_duties_occurred ON duty_entries(duty_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_voice_notes_recipient ON voice_notes(recipient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_handoffs_window ON handoff_obligations(starts_at, ends_at);
      CREATE INDEX IF NOT EXISTS idx_calendar_owner ON calendar_events(owner_id, start_at, end_at);
      CREATE INDEX IF NOT EXISTS idx_permission_queue ON permission_requests(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_launch_runs_date ON launch_runs(service_date);
    `);
  },
};

const familySeeds: Migration = {
  version: 3,
  name: "family-seeds",
  up: (db) => {
    const count = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as unknown as { n: number }).n;

    if (count("household_members") === 0) {
      const insertMember = db.prepare(
        `INSERT INTO household_members
         (id, display_name, role, color, icon, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      );
      insertMember.run("member-you", "You", "adult", "coral", "user", 0, SEED_EPOCH, SEED_EPOCH);
      insertMember.run("member-partner", "Partner", "adult", "indigo", "user-round", 1, SEED_EPOCH, SEED_EPOCH);
      insertMember.run("member-kid", "Kid", "child", "teal", "baby", 2, SEED_EPOCH, SEED_EPOCH);
    }

    if (count("duty_definitions") === 0) {
      const insertDuty = db.prepare(
        `INSERT INTO duty_definitions (id, name, icon, color, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      );
      insertDuty.run("duty-bedtime", "Bedtime", "bedtime", "violet", 0, SEED_EPOCH, SEED_EPOCH);
      insertDuty.run("duty-school-run", "School run", "school-run", "sky", 1, SEED_EPOCH, SEED_EPOCH);
      insertDuty.run("duty-dentist-booking", "Dentist booking", "dentist", "amber", 2, SEED_EPOCH, SEED_EPOCH);
      insertDuty.run("duty-permission-slip", "Permission slip", "permission-slip", "lime", 3, SEED_EPOCH, SEED_EPOCH);
      insertDuty.run("duty-night-wake", "Night wake-up", "night-wake", "rose", 4, SEED_EPOCH, SEED_EPOCH);
    }

    if (count("launch_templates") === 0) {
      db.prepare(
        `INSERT INTO launch_templates
         (id, child_id, name, weekdays, departure_local_time, active_window_minutes, chime_before_minutes, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        "launch-weekday",
        "member-kid",
        "Weekday launch",
        "[1,2,3,4,5]",
        "08:00",
        45,
        3,
        SEED_EPOCH,
        SEED_EPOCH,
      );

      const insertStep = db.prepare(
        `INSERT INTO launch_steps (id, template_id, label, icon, sort_order, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
      );
      insertStep.run("launch-step-shoes", "launch-weekday", "Shoes", "shoes", 0);
      insertStep.run("launch-step-bag", "launch-weekday", "Bag", "bag", 1);
      insertStep.run("launch-step-snack", "launch-weekday", "Snack", "snack", 2);
    }

    // backup_contacts are user-managed: never seeded.
  },
};

const MIGRATIONS: Migration[] = [baseline, familyFoundation, familySeeds];

/** Apply every migration that has not run yet, each in its own transaction. */
export function runMigrations(db: DatabaseSyncType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT version FROM schema_migrations").all() as unknown as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
