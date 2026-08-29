import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

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

describe("API integration", () => {
  it("serves health with all services", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.services.map((s: { service: string }) => s.service)).toContain("api");
  });

  it("creates and lists calendar events over HTTP", async () => {
    const { app } = makeApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload: { title: "Lunch", start: "2026-08-28T17:00:00Z", end: "2026-08-28T18:00:00Z" },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;

    const list = await app.inject({
      method: "GET",
      url: "/api/calendar/events?start=2026-08-28T00:00:00Z&end=2026-08-29T00:00:00Z",
    });
    expect(list.json().events.map((e: { title: string }) => e.title)).toContain("Lunch");

    const del = await app.inject({ method: "DELETE", url: `/api/calendar/events/${id}` });
    expect(del.statusCode).toBe(204);
  });

  it("rejects invalid calendar payloads", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload: { title: "" }, // missing start/end
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns demo home state without a Home Assistant URL", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/home" });
    expect(res.statusCode).toBe(200);
    expect(res.json().provider).toBe("demo");
  });

  it("gates sensitive voice actions behind confirmation", async () => {
    const { app } = makeApp();
    const gated = await app.inject({
      method: "POST",
      url: "/api/voice/execute",
      payload: {
        tool: "home_control",
        arguments: { entityId: "lock.front_door", action: "unlock", params: {} },
        confirm: false,
      },
    });
    expect(gated.statusCode).toBe(409);
    expect(gated.json().requiresConfirmation).toBe(true);

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/voice/execute",
      payload: {
        tool: "home_control",
        arguments: { entityId: "lock.front_door", action: "unlock", params: {} },
        confirm: true,
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().ok).toBe(true);
  });

  it("rejects unknown voice tools", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/voice/execute",
      payload: { tool: "rm_rf", arguments: {}, confirm: true },
    });
    expect(res.statusCode).toBe(404);
  });
});
