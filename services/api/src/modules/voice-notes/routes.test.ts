import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp, type AppContext } from "../../app.js";
import { loadConfig } from "../../config.js";
import { FixedClock } from "../../test/testClock.js";
import { VoiceNoteRepository } from "./repository.js";
import { VoiceNoteStorage } from "./storage.js";

/** Seeded members: You/Partner are adults, Kid is a child. */
const YOU = "member-you";
const PARTNER = "member-partner";
const KID = "member-kid";

function makeApp(overrides: { maxBytes?: number } = {}): { ctx: AppContext; dir: string; voiceDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-notes-routes-"));
  const config = loadConfig({
    API_HOST: "127.0.0.1",
    API_PORT: "8787",
    DATABASE_PATH: path.join(dir, "test.sqlite"),
    VOICE_NOTE_DIR: path.join(dir, "voice-notes"),
    ...(overrides.maxBytes !== undefined ? { VOICE_NOTE_MAX_BYTES: String(overrides.maxBytes) } : {}),
    HA_URL: "",
    HA_TOKEN: "",
    WEATHER_LATITUDE: "40",
    WEATHER_LONGITUDE: "-74",
  });
  return { ctx: buildApp(config), dir, voiceDir: path.join(dir, "voice-notes") };
}

function upload(
  ctx: AppContext,
  metadata: Record<string, unknown>,
  bytes: Buffer,
  blobType = metadata.mimeType as string,
) {
  const fd = new FormData();
  fd.append("metadata", JSON.stringify(metadata));
  fd.append("audio", new Blob([bytes], { type: blobType }), "note.webm");
  return ctx.app.inject({ method: "POST", url: "/api/voice-notes", payload: fd as unknown as never });
}

const validMeta = (senderId = YOU, recipientId = PARTNER) => ({
  senderId,
  recipientId,
  mimeType: "audio/webm",
  durationMs: 1500,
});

describe("voice-note routes", () => {
  it("uploads a webm note and streams it back", async () => {
    const { ctx, voiceDir } = makeApp();
    const bytes = Buffer.from("fake-audio-bytes");

    const up = await upload(ctx, { ...validMeta(KID, YOU), transcript: "dinner in five" }, bytes);
    expect(up.statusCode).toBe(201);
    const note = up.json();
    expect(note.id).toEqual(expect.any(String));
    expect(note.audioUrl).toBe(`/api/voice-notes/${note.id}/audio`);
    expect(note.senderId).toBe(KID);
    expect(note.recipientId).toBe(YOU);
    expect(note.mimeType).toBe("audio/webm");
    expect(note.durationMs).toBe(1500);
    expect(note.sizeBytes).toBe(bytes.length);
    expect(note.transcript).toBe("dinner in five");
    expect(note.readAt).toBeNull();
    expect(typeof note.createdAt).toBe("string");

    const stored = fs.readdirSync(voiceDir);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/\.webm$/);

    const audio = await ctx.app.inject({ method: "GET", url: note.audioUrl });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["content-type"]).toBe("audio/webm");
    expect(audio.headers["content-length"]).toBe(String(bytes.length));
    expect(audio.rawPayload.toString()).toBe("fake-audio-bytes");
  });

  it("rejects non-whitelisted or mismatched mime types with 400", async () => {
    const { ctx } = makeApp();

    const wav = await upload(ctx, { ...validMeta(), mimeType: "audio/wav" }, Buffer.from("w"), "audio/wav");
    expect(wav.statusCode).toBe(400);

    const mismatch = await upload(ctx, validMeta(), Buffer.from("w"), "audio/wav");
    expect(mismatch.statusCode).toBe(400);
  });

  /**
   * Browsers report `MediaRecorder.mimeType` with the codec attached, so the
   * uploaded part arrives as `audio/webm;codecs=opus` while the metadata
   * carries the bare enum value. Comparing the raw strings rejected every
   * real recording with "audio mime type does not match metadata".
   */
  it("accepts an audio part whose mime carries a codecs parameter", async () => {
    const { ctx } = makeApp();

    const up = await upload(
      ctx,
      validMeta(),
      Buffer.from("fake-audio-bytes"),
      "audio/webm;codecs=opus",
    );

    expect(up.statusCode).toBe(201);
    expect(up.json().mimeType).toBe("audio/webm");
  });

  it("rejects metadata outside the contract with 400", async () => {
    const { ctx } = makeApp();

    const tooLong = await upload(ctx, { ...validMeta(), durationMs: 60001 }, Buffer.from("x"));
    expect(tooLong.statusCode).toBe(400);

    const negative = await upload(ctx, { ...validMeta(), durationMs: -1 }, Buffer.from("x"));
    expect(negative.statusCode).toBe(400);

    const longTranscript = await upload(ctx, { ...validMeta(), transcript: "x".repeat(2001) }, Buffer.from("x"));
    expect(longTranscript.statusCode).toBe(400);

    const audioOnly = new FormData();
    audioOnly.append("audio", new Blob([Buffer.from("x")], { type: "audio/webm" }), "note.webm");
    const noMeta = await ctx.app.inject({
      method: "POST",
      url: "/api/voice-notes",
      payload: audioOnly as unknown as never,
    });
    expect(noMeta.statusCode).toBe(400);

    const fd = new FormData();
    fd.append("metadata", "{not json");
    fd.append("audio", new Blob([Buffer.from("x")], { type: "audio/webm" }), "note.webm");
    const badJson = await ctx.app.inject({ method: "POST", url: "/api/voice-notes", payload: fd as unknown as never });
    expect(badJson.statusCode).toBe(400);

    const notMultipart = await ctx.app.inject({ method: "POST", url: "/api/voice-notes", payload: validMeta() });
    expect(notMultipart.statusCode).toBe(400);
  });

  it("rejects uploads over the configured size cap with 413 and saves nothing", async () => {
    const { ctx, voiceDir } = makeApp({ maxBytes: 1000 });

    const res = await upload(ctx, validMeta(), Buffer.alloc(1500, 7));
    expect(res.statusCode).toBe(413);
    expect(fs.readdirSync(voiceDir)).toEqual([]);
  });

  it("cleans up the partial file when the row cannot be written", async () => {
    const { ctx, voiceDir } = makeApp();

    const res = await upload(ctx, validMeta("member-nobody"), Buffer.from("orphan"));
    expect(res.statusCode).toBe(400);
    expect(fs.readdirSync(voiceDir)).toEqual([]);
  });

  it("treats traversal-shaped ids as unknown, never serving file contents", async () => {
    const { ctx } = makeApp();

    for (const id of ["x%2F..%2F..%2Fetc%2Fpasswd", "..%2F..%2Fetc%2Fpasswd", "..", "%2e%2e%2f", "no-such-note"]) {
      const res = await ctx.app.inject({ method: "GET", url: `/api/voice-notes/${id}/audio` });
      expect(res.statusCode, `id=${id}`).toBe(404);
      expect(res.rawPayload.toString()).not.toContain("root:");
    }
  });

  it("serves range requests with 206, exact bytes, and 416 when unsatisfiable", async () => {
    const { ctx } = makeApp();
    const up = await upload(ctx, validMeta(), Buffer.from("0123456789"));
    const url = up.json().audioUrl as string;

    const range = await ctx.app.inject({ method: "GET", url, headers: { range: "bytes=0-1" } });
    expect(range.statusCode).toBe(206);
    expect(range.rawPayload.length).toBe(2);
    expect(range.rawPayload.toString()).toBe("01");
    expect(range.headers["content-range"]).toBe("bytes 0-1/10");
    expect(range.headers["content-length"]).toBe("2");
    expect(range.headers["content-type"]).toBe("audio/webm");

    const openEnded = await ctx.app.inject({ method: "GET", url, headers: { range: "bytes=8-" } });
    expect(openEnded.statusCode).toBe(206);
    expect(openEnded.rawPayload.toString()).toBe("89");
    expect(openEnded.headers["content-range"]).toBe("bytes 8-9/10");

    const suffix = await ctx.app.inject({ method: "GET", url, headers: { range: "bytes=-3" } });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.rawPayload.toString()).toBe("789");
    expect(suffix.headers["content-range"]).toBe("bytes 7-9/10");

    const clamped = await ctx.app.inject({ method: "GET", url, headers: { range: "bytes=5-999" } });
    expect(clamped.statusCode).toBe(206);
    expect(clamped.rawPayload.toString()).toBe("56789");
    expect(clamped.headers["content-range"]).toBe("bytes 5-9/10");

    const unsatisfiable = await ctx.app.inject({ method: "GET", url, headers: { range: "bytes=10-" } });
    expect(unsatisfiable.statusCode).toBe(416);
    expect(unsatisfiable.headers["content-range"]).toBe("bytes */10");

    // Malformed Range headers are ignored per RFC 9110: full 200 response.
    const malformed = await ctx.app.inject({ method: "GET", url, headers: { range: "bytes=abc" } });
    expect(malformed.statusCode).toBe(200);
    expect(malformed.rawPayload.toString()).toBe("0123456789");
  });

  it("marks a note read once, keeping the original timestamp", async () => {
    const { ctx, dir } = makeApp();

    const missing = await ctx.app.inject({ method: "POST", url: "/api/voice-notes/nope/read" });
    expect(missing.statusCode).toBe(404);

    const uploaded = await upload(ctx, validMeta(), Buffer.from("readme"));
    const id = uploaded.json().id as string;

    const marked = await ctx.app.inject({ method: "POST", url: `/api/voice-notes/${id}/read` });
    expect(marked.statusCode).toBe(200);
    expect(marked.json().readAt).not.toBeNull();

    // A FixedClock repository proves idempotency: an hour later, the
    // timestamp must not move on re-read.
    const clock = new FixedClock("2026-08-29T12:00:00.000Z");
    const repo = new VoiceNoteRepository(ctx.db, new VoiceNoteStorage(path.join(dir, "unused")), clock);
    const fresh = (await upload(ctx, validMeta(), Buffer.from("twice"))).json().id as string;
    const first = repo.markRead(fresh)!;
    expect(first.readAt).toBe("2026-08-29T12:00:00.000Z");
    clock.advanceMs(3_600_000);
    const again = repo.markRead(fresh)!;
    expect(again.readAt).toBe(first.readAt);
  });

  it("deletes the row and its file", async () => {
    const { ctx, voiceDir } = makeApp();
    const uploaded = await upload(ctx, validMeta(), Buffer.from("short-lived"));
    const note = uploaded.json();

    const row = ctx.db
      .prepare("SELECT audio_url FROM voice_notes WHERE id = ?")
      .get(note.id) as { audio_url: string };
    expect(fs.existsSync(path.join(voiceDir, row.audio_url))).toBe(true);

    const missing = await ctx.app.inject({ method: "DELETE", url: "/api/voice-notes/nope" });
    expect(missing.statusCode).toBe(404);

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/voice-notes/${note.id}` });
    expect(del.statusCode).toBe(204);
    expect(fs.existsSync(path.join(voiceDir, row.audio_url))).toBe(false);
    expect(fs.readdirSync(voiceDir)).toEqual([]);

    const audio = await ctx.app.inject({ method: "GET", url: note.audioUrl });
    expect(audio.statusCode).toBe(404);

    const list = await ctx.app.inject({ method: "GET", url: `/api/voice-notes?recipientId=${PARTNER}` });
    expect(list.json().notes).toEqual([]);
  });

  it("lists notes for a recipient, newest first and filtered", async () => {
    const { ctx, dir } = makeApp();
    const clock = new FixedClock(new Date().toISOString());
    const repo = new VoiceNoteRepository(ctx.db, new VoiceNoteStorage(path.join(dir, "unused")), clock);
    const meta = (recipientId: string) => ({ senderId: YOU, recipientId, mimeType: "audio/ogg" as const, durationMs: 1000 });

    const older = repo.create(meta(PARTNER), 10, "a.ogg");
    clock.advanceMs(60_000);
    const forKid = repo.create(meta(KID), 10, "b.ogg");
    clock.advanceMs(60_000);
    const newer = repo.create(meta(PARTNER), 10, "c.ogg");
    clock.advanceMs(60_000);
    const newest = repo.create(meta(PARTNER), 10, "d.ogg");
    expect(forKid.id).toBeDefined();

    const list = await ctx.app.inject({ method: "GET", url: `/api/voice-notes?recipientId=${PARTNER}` });
    expect(list.statusCode).toBe(200);
    expect(list.json().notes.map((n: { id: string }) => n.id)).toEqual([newest.id, newer.id, older.id]);

    const limited = await ctx.app.inject({ method: "GET", url: `/api/voice-notes?recipientId=${PARTNER}&limit=2` });
    expect(limited.json().notes.map((n: { id: string }) => n.id)).toEqual([newest.id, newer.id]);

    const badLimit = await ctx.app.inject({ method: "GET", url: `/api/voice-notes?recipientId=${PARTNER}&limit=zero` });
    expect(badLimit.statusCode).toBe(400);

    const missing = await ctx.app.inject({ method: "GET", url: "/api/voice-notes" });
    expect(missing.statusCode).toBe(400);
  });
});
