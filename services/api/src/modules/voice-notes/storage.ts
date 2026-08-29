import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Thrown when a filename could escape the voice-note directory. */
export class PathError extends Error {
  constructor(name: string) {
    super(`unsafe voice-note filename: ${JSON.stringify(name)}`);
    this.name = "PathError";
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
};

const DAY_MS = 86_400_000;

/**
 * Guard every storage-facing name. Only plain, single-segment basenames are
 * accepted: no separators, no NUL bytes, no `..` anywhere (covers `../evil`,
 * `..%2F` tricks and Windows drive forms alike). This is the path-traversal
 * firewall for the module — callers pass ids that came from the database
 * row's audio_url, never from the request URL.
 */
export function assertSafeName(name: string): void {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.includes("..") ||
    path.isAbsolute(name)
  ) {
    throw new PathError(name);
  }
}

/**
 * Local filesystem store for voice-note recordings.
 *
 * Files land in one flat directory as `<uuid>.<ext>`. Writes are atomic:
 * bytes go to a `<uuid>.tmp` sibling first and are renamed into place, so a
 * crash mid-write can never leave a half-written note behind. Every read
 * path goes through {@link assertSafeName}.
 */
export class VoiceNoteStorage {
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Atomically persist `buffer` and return its storage filename. */
  async save(buffer: Buffer, mimeType: string): Promise<{ filename: string }> {
    const ext = EXTENSION_BY_MIME[mimeType];
    if (!ext) {
      throw new Error(`unsupported voice-note mime type: ${mimeType}`);
    }
    const id = randomUUID();
    const filename = `${id}.${ext}`;
    const tmpPath = path.join(this.dir, `${id}.tmp`);
    const finalPath = path.join(this.dir, filename);
    try {
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // best effort — the tmp file may never have been created
      }
      throw err;
    }
    return { filename };
  }

  /** Read a stored note. Traversal-shaped names throw PathError. */
  read(filename: string): Buffer {
    assertSafeName(filename);
    return fs.readFileSync(path.join(this.dir, filename));
  }

  /** Absolute path for streaming; guards the same way as read. */
  filePath(filename: string): string {
    assertSafeName(filename);
    return path.join(this.dir, filename);
  }

  /** Delete a stored note. Never throws — missing or unsafe names are ignored. */
  remove(filename: string): void {
    try {
      assertSafeName(filename);
    } catch {
      return;
    }
    try {
      fs.unlinkSync(path.join(this.dir, filename));
    } catch {
      // missing file is fine — removal is best-effort
    }
  }

  /**
   * Delete files older than `days` (by mtime) and return their names so the
   * caller can drop the matching database rows.
   */
  prune(days: number, now: Date = new Date()): string[] {
    const cutoffMs = now.getTime() - days * DAY_MS;
    const pruned: string[] = [];
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return pruned;
    }
    for (const entry of entries) {
      const full = path.join(this.dir, entry);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile() || stat.mtimeMs >= cutoffMs) continue;
        fs.unlinkSync(full);
        pruned.push(entry);
      } catch {
        // racing writers or unreadable entries are skipped
      }
    }
    return pruned;
  }
}
