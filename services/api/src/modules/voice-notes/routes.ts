import type { FastifyError, FastifyInstance } from "fastify";
import { VoiceNoteInput } from "@home-dashboard/contracts";
import type { VoiceNoteRepository } from "./repository.js";
import { PathError, type VoiceNoteStorage } from "./storage.js";

export interface VoiceNoteRouteDeps {
  repo: VoiceNoteRepository;
  storage: VoiceNoteStorage;
  /** Upload cap; mirrors the multipart plugin's limits.fileSize. */
  maxBytes: number;
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parse a `Range: bytes=a-b` header against a body of `size` bytes.
 *
 * - absent/malformed → null (serve the full 200 body, per RFC 9110)
 * - satisfiable → { start, end } with end clamped to size-1; suffix
 *   (`bytes=-N`, last N bytes) and open-ended (`bytes=a-`) forms supported
 * - unsatisfiable (start >= size, or size 0) → "unsatisfiable" (416)
 */
function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return null;
  const [, startRaw, endRaw] = match;
  if (startRaw === "" && endRaw === "") return null;
  if (size === 0) return "unsatisfiable";
  if (startRaw === "") {
    const suffixLength = Number(endRaw);
    if (suffixLength === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(startRaw);
  if (start >= size) return "unsatisfiable";
  const end = endRaw === "" ? size - 1 : Number(endRaw);
  if (end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * The bare type from a mime string, dropping any parameters.
 *
 * Browsers report `MediaRecorder.mimeType` with the codec attached
 * (`audio/webm;codecs=opus`), and that string reaches us as the uploaded
 * part's own content type. Comparing the raw strings rejected valid uploads,
 * so both sides are normalized before the equality check.
 */
function baseMimeType(mime: string): string {
  return mime.split(";")[0]!.trim();
}

/** SQLite signals a missing sender/recipient this way; surfaced as 400. */
function isForeignKeyError(err: unknown): boolean {
  const e = err as { message?: unknown };
  return typeof e.message === "string" && /FOREIGN KEY/i.test(e.message);
}

/**
 * Voice-note HTTP surface: multipart upload, per-recipient listing, HTTP
 * range streaming, read receipts and deletion.
 *
 * Security invariant: the `:id` routes never feed the URL id into a storage
 * path — the id selects a row, and the row's stored audio_url (a bare
 * filename) goes through VoiceNoteStorage's assertSafeName before any file
 * is touched. Traversal-shaped ids simply find no row and 404.
 */
export function voiceNoteRoutes(app: FastifyInstance, deps: VoiceNoteRouteDeps): void {
  app.post("/api/voice-notes", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({ error: "multipart/form-data required" });
    }

    let metadataRaw: string | undefined;
    let audio: { buffer: Buffer; mimetype: string } | undefined;
    try {
      for await (const part of request.parts()) {
        if (part.type === "field") {
          if (part.fieldname === "metadata" && metadataRaw === undefined) {
            metadataRaw = part.value as string;
          }
        } else if (part.fieldname === "audio") {
          if (audio !== undefined) {
            return reply.status(400).send({ error: "duplicate audio part" });
          }
          // toBuffer() rejects with RequestFileTooLargeError when the
          // registered limits.fileSize trips.
          audio = { buffer: await part.toBuffer(), mimetype: part.mimetype };
        }
      }
    } catch (err) {
      const statusCode = (err as FastifyError).statusCode;
      if (statusCode === 413) {
        return reply.status(413).send({ error: "audio file too large" });
      }
      return reply.status(400).send({ error: "malformed multipart body" });
    }

    if (metadataRaw === undefined) {
      return reply.status(400).send({ error: "metadata part required" });
    }
    let metadataJson: unknown;
    try {
      metadataJson = JSON.parse(metadataRaw);
    } catch {
      return reply.status(400).send({ error: "metadata must be valid JSON" });
    }
    const parsed = VoiceNoteInput.safeParse(metadataJson);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid voice note metadata", details: parsed.error.flatten() });
    }
    if (audio === undefined) {
      return reply.status(400).send({ error: "audio part required" });
    }

    // The metadata's mime drives both the whitelist (zod enum) and the stored
    // file's extension; the file part itself must agree with it.
    if (baseMimeType(audio.mimetype) !== parsed.data.mimeType) {
      return reply.status(400).send({ error: "audio mime type does not match metadata" });
    }
    // Belt-and-braces: the plugin's fileSize limit is the primary gate.
    if (audio.buffer.length > deps.maxBytes) {
      return reply.status(413).send({ error: "audio file too large" });
    }

    // Save the file first, then the row; a failed insert (e.g. unknown
    // sender/recipient tripping the FK) must never leave an orphaned file.
    const saved = await deps.storage.save(audio.buffer, parsed.data.mimeType);
    try {
      const note = deps.repo.create(parsed.data, audio.buffer.length, saved.filename);
      return reply.status(201).send(note);
    } catch (err) {
      deps.storage.remove(saved.filename);
      if (isForeignKeyError(err)) {
        return reply.status(400).send({ error: "unknown sender or recipient" });
      }
      throw err;
    }
  });

  app.get("/api/voice-notes", async (request, reply) => {
    const query = request.query as { recipientId?: string; limit?: string };
    const recipientId = query.recipientId;
    if (recipientId === undefined || recipientId === "") {
      return reply.status(400).send({ error: "recipientId is required" });
    }
    let limit = DEFAULT_LIST_LIMIT;
    if (query.limit !== undefined) {
      const requested = Number(query.limit);
      if (!Number.isInteger(requested) || requested < 1) {
        return reply.status(400).send({ error: "limit must be a positive integer" });
      }
      limit = Math.min(requested, MAX_LIST_LIMIT);
    }
    return reply.send({ notes: deps.repo.listForRecipient(recipientId, limit) });
  });

  app.get("/api/voice-notes/:id/audio", async (request, reply) => {
    const { id } = request.params as { id: string };
    const audio = deps.repo.getAudio(id);
    if (audio === undefined) {
      return reply.status(404).send({ error: "not found" });
    }
    let bytes: Buffer;
    try {
      bytes = deps.storage.read(audio.filename);
    } catch (err) {
      if (err instanceof PathError || (err as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.status(404).send({ error: "audio not available" });
      }
      throw err;
    }

    const size = bytes.length;
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", audio.mimeType);

    const range = parseRange(request.headers.range, size);
    if (range === "unsatisfiable") {
      return reply.status(416).header("Content-Range", `bytes */${size}`).send();
    }
    if (range === null) {
      reply.header("Content-Length", String(size));
      return reply.status(200).send(bytes);
    }
    reply
      .status(206)
      .header("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
      .header("Content-Length", String(range.end - range.start + 1))
      .send(bytes.subarray(range.start, range.end + 1));
  });

  app.post("/api/voice-notes/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };
    const note = deps.repo.markRead(id);
    if (note === undefined) return reply.status(404).send({ error: "not found" });
    return reply.send(note);
  });

  app.delete("/api/voice-notes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = deps.repo.remove(id);
    if (removed === undefined) return reply.status(404).send({ error: "not found" });
    return reply.status(204).send();
  });
}
