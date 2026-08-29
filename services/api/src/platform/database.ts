import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrations.js";

// node:sqlite is a Node 22.5+ builtin that Vite's transform pipeline (used by
// Vitest) does not recognize. Resolve it at runtime via createRequire so every
// runtime (Node, tsx, Vitest) loads the native builtin directly, while the
// type-only import keeps full type safety and is erased before any bundling.
const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncImpl } = require("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

/**
 * Thin SQLite wrapper around node:sqlite (built-in, zero native deps).
 * Synchronous API is fine for a local single-user dashboard.
 */
export class Database {
  private db: DatabaseSyncType;

  constructor(private filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSyncImpl(filePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    runMigrations(this.db);
  }

  get raw(): DatabaseSyncType {
    return this.db;
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}
