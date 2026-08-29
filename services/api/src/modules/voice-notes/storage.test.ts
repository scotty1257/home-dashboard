import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeName, PathError, VoiceNoteStorage } from "./storage.js";

function makeStorage(): { storage: VoiceNoteStorage; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-notes-"));
  return { storage: new VoiceNoteStorage(dir), dir };
}

describe("VoiceNoteStorage", () => {
  it("round-trips bytes with the mime-derived extension and no temp leftovers", async () => {
    const { storage, dir } = makeStorage();
    const bytes = Buffer.from("fake-webm-payload");

    const saved = await storage.save(bytes, "audio/webm");

    expect(saved.filename).toMatch(/^[0-9a-f-]{36}\.webm$/);
    expect(storage.read(saved.filename).toString()).toBe("fake-webm-payload");
    expect(fs.existsSync(path.join(dir, saved.filename))).toBe(true);
    // The atomic rename must leave no .tmp siblings behind.
    expect(fs.readdirSync(dir)).toEqual([saved.filename]);

    const ogg = await storage.save(Buffer.from("ogg"), "audio/ogg");
    expect(ogg.filename.endsWith(".ogg")).toBe(true);
    const mp4 = await storage.save(Buffer.from("mp4"), "audio/mp4");
    expect(mp4.filename.endsWith(".mp4")).toBe(true);
  });

  it("rejects unsupported mime types at save time", async () => {
    const { storage } = makeStorage();
    await expect(storage.save(Buffer.from("x"), "audio/wav")).rejects.toThrow(/unsupported/i);
  });

  it("refuses path-traversal names via assertSafeName and read", async () => {
    const { storage } = makeStorage();
    const { filename } = await storage.save(Buffer.from("safe"), "audio/webm");
    expect(() => assertSafeName(filename)).not.toThrow();

    const evil = [
      "../evil",
      "..",
      "a/b",
      "/etc/passwd",
      "\\etc\\passwd",
      "..\\..\\etc\\passwd",
      "note\0.webm",
      "..%2F..%2Fetc%2Fpasswd",
      ".",
      "",
    ];
    for (const name of evil) {
      expect(() => assertSafeName(name), `assertSafeName(${JSON.stringify(name)})`).toThrow(PathError);
      expect(() => storage.read(name), `read(${JSON.stringify(name)})`).toThrow(PathError);
    }
  });

  it("removes files and is a no-op when the file is missing or unsafe", async () => {
    const { storage, dir } = makeStorage();
    const { filename } = await storage.save(Buffer.from("bye"), "audio/ogg");

    storage.remove(filename);
    expect(fs.readdirSync(dir)).toEqual([]);

    // Missing and unsafe names must never throw.
    expect(() => storage.remove(filename)).not.toThrow();
    expect(() => storage.remove("../escape")).not.toThrow();
  });

  it("prunes files older than the retention window and reports them", async () => {
    const { storage, dir } = makeStorage();
    const old = await storage.save(Buffer.from("old"), "audio/webm");
    const fresh = await storage.save(Buffer.from("fresh"), "audio/webm");
    const ancient = await storage.save(Buffer.from("ancient"), "audio/webm");

    const now = new Date("2026-08-29T12:00:00.000Z");
    // 40 days old → pruned by a 30-day window; 5 days old → kept.
    fs.utimesSync(path.join(dir, old.filename), new Date(now.getTime() - 40 * 86_400_000), new Date(now.getTime() - 40 * 86_400_000));
    fs.utimesSync(path.join(dir, ancient.filename), new Date(now.getTime() - 31 * 86_400_000), new Date(now.getTime() - 31 * 86_400_000));

    const pruned = storage.prune(30, now);

    expect(pruned.sort()).toEqual([ancient.filename, old.filename].sort());
    expect(fs.readdirSync(dir)).toEqual([fresh.filename]);
  });
});
