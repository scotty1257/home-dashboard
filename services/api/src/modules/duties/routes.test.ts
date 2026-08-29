import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";

function makeApp() {
  const config = loadConfig({
    API_HOST: "127.0.0.1",
    API_PORT: "8787",
    DATABASE_PATH: ":memory:",
    HA_URL: "",
    HA_TOKEN: "",
    WEATHER_LATITUDE: "40",
    WEATHER_LONGITUDE: "-74",
  });
  return buildApp(config);
}

/** Seeded members: You/Partner are adults, Kid is a child. */
const YOU = "member-you";
const PARTNER = "member-partner";
const KID = "member-kid";

function logEntry(app: ReturnType<typeof makeApp>["app"], dutyId: string, performedBy: string) {
  return app.inject({ method: "POST", url: "/api/duties/entries", payload: { dutyId, performedBy } });
}

describe("duty routes", () => {
  it("returns the seeded summary and validates the window query", async () => {
    const { app } = makeApp();

    const ok = await app.inject({ method: "GET", url: "/api/duties" });
    expect(ok.statusCode).toBe(200);
    const summary = ok.json();
    expect(summary.windowStart).toBeDefined();
    expect(summary.windowEnd).toBeDefined();
    expect(summary.duties.map((d: { name: string }) => d.name)).toContain("Bedtime");
    expect(summary.recentEntries).toEqual([]);

    const seven = await app.inject({ method: "GET", url: "/api/duties?windowDays=7" });
    expect(seven.statusCode).toBe(200);
    expect(seven.json().windowStart).not.toBe(summary.windowStart);

    for (const bad of ["0", "366", "abc", "-1", "2.5"]) {
      const res = await app.inject({ method: "GET", url: `/api/duties?windowDays=${bad}` });
      expect(res.statusCode).toBe(400);
    }
  });

  it("logs an entry as an adult, rejecting child performers with 403", async () => {
    const { app } = makeApp();

    const child = await logEntry(app, "duty-bedtime", KID);
    expect(child.statusCode).toBe(403);
    expect(child.json().error).toBe("adult role required");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/duties/entries",
      payload: { dutyId: "duty-bedtime" },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await logEntry(app, "duty-bedtime", YOU);
    expect(created.statusCode).toBe(201);
    const entry = created.json();
    expect(entry.dutyName).toBe("Bedtime");
    expect(entry.performerName).toBe("You");
    expect(typeof entry.occurredAt).toBe("string");

    // The fresh entry is visible in the summary's recent list.
    const summary = await app.inject({ method: "GET", url: "/api/duties" });
    expect(summary.json().recentEntries.map((e: { id: string }) => e.id)).toContain(entry.id);
  });

  it("undoes over HTTP: latest only, adults only, 404 for unknown ids", async () => {
    const { app } = makeApp();
    const first = (await logEntry(app, "duty-school-run", YOU)).json();
    const second = (await logEntry(app, "duty-school-run", PARTNER)).json();

    const notLatest = await app.inject({
      method: "DELETE",
      url: `/api/duties/entries/${first.id}`,
      payload: { actorId: YOU },
    });
    expect(notLatest.statusCode).toBe(409);

    const child = await app.inject({
      method: "DELETE",
      url: `/api/duties/entries/${second.id}`,
      payload: { actorId: KID },
    });
    expect(child.statusCode).toBe(403);

    const undone = await app.inject({
      method: "DELETE",
      url: `/api/duties/entries/${second.id}`,
      payload: { actorId: YOU },
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json().entry.id).toBe(second.id);

    const missing = await app.inject({
      method: "DELETE",
      url: "/api/duties/entries/no-such-entry",
      payload: { actorId: YOU },
    });
    expect(missing.statusCode).toBe(404);

    // After the undo the older entry is the latest — deletable.
    const nowLatest = await app.inject({
      method: "DELETE",
      url: `/api/duties/entries/${first.id}`,
      payload: { actorId: PARTNER },
    });
    expect(nowLatest.statusCode).toBe(200);
  });

  it("creates and updates duty definitions, adults only", async () => {
    const { app } = makeApp();
    const input = { name: "Trash", icon: "trash", color: "slate", sortOrder: 5, active: true };

    const child = await app.inject({ method: "POST", url: "/api/duties", payload: { ...input, actorId: KID } });
    expect(child.statusCode).toBe(403);

    const invalid = await app.inject({ method: "POST", url: "/api/duties", payload: { actorId: YOU, name: "", icon: "trash", color: "slate", sortOrder: 5, active: true } });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({ method: "POST", url: "/api/duties", payload: { ...input, actorId: YOU } });
    expect(created.statusCode).toBe(201);
    const definition = created.json();
    expect(definition.name).toBe("Trash");
    expect(definition.icon).toBe("trash");
    expect(definition.active).toBe(true);

    // New duties appear on the summary board immediately.
    const summary = await app.inject({ method: "GET", url: "/api/duties" });
    expect(summary.json().duties.map((d: { dutyId: string }) => d.dutyId)).toContain(definition.id);

    const childUpdate = await app.inject({
      method: "PUT",
      url: `/api/duties/${definition.id}`,
      payload: { ...input, name: "Trash night", actorId: KID },
    });
    expect(childUpdate.statusCode).toBe(403);

    const updated = await app.inject({
      method: "PUT",
      url: `/api/duties/${definition.id}`,
      payload: { ...input, name: "Trash night", active: false, actorId: PARTNER },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Trash night");
    expect(updated.json().active).toBe(false);

    const missing = await app.inject({
      method: "PUT",
      url: "/api/duties/no-such-duty",
      payload: { ...input, actorId: YOU },
    });
    expect(missing.statusCode).toBe(404);
  });
});
