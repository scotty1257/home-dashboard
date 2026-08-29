import { randomUUID } from "node:crypto";
import type { VoiceNote, VoiceNoteInput } from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";
import { RealClock, type Clock } from "../../test/testClock.js";
import type { VoiceNoteStorage } from "./storage.js";

const DAY_MS = 86_400_000;
const LIST_LIMIT_DEFAULT = 20;

interface VoiceNoteRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  in_reply_to_id: string | null;
  audio_url: string;
  mime_type: string;
  duration_ms: number;
  size_bytes: number;
  transcript: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * Serialize a row for the API. Clients only ever see the streaming endpoint
 * in `audioUrl` — the storage filename stays an implementation detail.
 */
function rowToNote(row: VoiceNoteRow): VoiceNote {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    inReplyToId: row.in_reply_to_id ?? undefined,
    audioUrl: `/api/voice-notes/${row.id}/audio`,
    mimeType: row.mime_type as VoiceNote["mimeType"],
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes,
    transcript: row.transcript ?? undefined,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  };
}

/** What the streaming route needs to serve a stored file. */
export interface VoiceNoteAudio {
  /** Storage filename resolved from the row's audio_url — never client-supplied. */
  filename: string;
  mimeType: VoiceNote["mimeType"];
  sizeBytes: number;
}

/**
 * Voice-note rows plus the files behind them.
 *
 * The `audio_url` column stores the storage-relative filename (a bare
 * `<uuid>.<ext>`); the endpoint form (`/api/voice-notes/:id/audio`) is
 * synthesized in {@link rowToNote}. Every file operation funnels the stored
 * value through VoiceNoteStorage's assertSafeName guard, so a corrupted row
 * can never name a file outside the voice-note directory. Any member —
 * adult or child — can send and receive notes.
 */
export class VoiceNoteRepository {
  constructor(
    private db: Database,
    private storage: VoiceNoteStorage,
    private clock: Clock = new RealClock(),
    private retentionDays = 30,
  ) {}

  /** Insert a note; `filename` is the stored audio file from VoiceNoteStorage.save. */
  create(input: VoiceNoteInput, sizeBytes: number, filename: string): VoiceNote {
    const id = randomUUID();
    const createdAt = this.clock.nowIso();
    this.db
      .prepare(
        `INSERT INTO voice_notes
         (id, sender_id, recipient_id, in_reply_to_id, audio_url, mime_type, duration_ms, size_bytes, transcript, created_at, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        input.senderId,
        input.recipientId,
        input.inReplyToId ?? null,
        filename,
        input.mimeType,
        input.durationMs,
        sizeBytes,
        input.transcript ?? null,
        createdAt,
      );
    eventHub.emit(Events.voiceNoteChanged, { action: "created", id, recipientId: input.recipientId });
    return this.get(id)!;
  }

  /**
   * A recipient's notes, newest first. Runs retention opportunistically:
   * pruning failures are swallowed — listing must never break because
   * cleanup hiccuped.
   */
  listForRecipient(recipientId: string, limit = LIST_LIMIT_DEFAULT): VoiceNote[] {
    try {
      this.pruneExpired();
    } catch {
      // best-effort retention
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM voice_notes WHERE recipient_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(recipientId, limit) as unknown as VoiceNoteRow[];
    return rows.map(rowToNote);
  }

  get(id: string): VoiceNote | undefined {
    const row = this.row(id);
    return row === undefined ? undefined : rowToNote(row);
  }

  /** Raw file reference for the streaming route (404 when the id is unknown). */
  getAudio(id: string): VoiceNoteAudio | undefined {
    const row = this.row(id);
    if (row === undefined) return undefined;
    return {
      filename: row.audio_url,
      mimeType: row.mime_type as VoiceNote["mimeType"],
      sizeBytes: row.size_bytes,
    };
  }

  /** Stamp read_at once; re-reads keep the original timestamp. */
  markRead(id: string): VoiceNote | undefined {
    const row = this.row(id);
    if (row === undefined) return undefined;
    if (row.read_at === null) {
      this.db
        .prepare(`UPDATE voice_notes SET read_at = ? WHERE id = ? AND read_at IS NULL`)
        .run(this.clock.nowIso(), id);
      eventHub.emit(Events.voiceNoteChanged, { action: "read", id });
    }
    return this.get(id)!;
  }

  /** Delete the row and its file. Returns the removed note, undefined when unknown. */
  remove(id: string): VoiceNote | undefined {
    const row = this.row(id);
    if (row === undefined) return undefined;
    this.db.prepare(`DELETE FROM voice_notes WHERE id = ?`).run(id);
    this.storage.remove(row.audio_url);
    eventHub.emit(Events.voiceNoteChanged, { action: "deleted", id });
    return rowToNote(row);
  }

  /**
   * Retention sweep: drop rows older than the window (and their files), then
   * sweep the directory for orphaned files by mtime. Returns removed row ids.
   */
  pruneExpired(retentionDays: number = this.retentionDays): string[] {
    const cutoff = new Date(this.clock.now().getTime() - retentionDays * DAY_MS).toISOString();
    const rows = this.db
      .prepare(`SELECT id, audio_url FROM voice_notes WHERE created_at < ?`)
      .all(cutoff) as unknown as { id: string; audio_url: string }[];
    const removed: string[] = [];
    for (const row of rows) {
      this.db.prepare(`DELETE FROM voice_notes WHERE id = ?`).run(row.id);
      this.storage.remove(row.audio_url);
      removed.push(row.id);
    }
    this.storage.prune(retentionDays, this.clock.now());
    return removed;
  }

  private row(id: string): VoiceNoteRow | undefined {
    return this.db
      .prepare(`SELECT * FROM voice_notes WHERE id = ?`)
      .get(id) as unknown as VoiceNoteRow | undefined;
  }
}
