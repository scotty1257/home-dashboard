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

/** Seeded members: You is an adult, Kid is a child. */
const YOU = "member-you";
const KID = "member-kid";

function kidRequest() {
  return {
    childId: KID,
    category: "sleepover",
    question: "Sleepover at Maya's tonight?",
    createdBy: KID,
  };
}

describe("permission routes", () => {
  it("13. lets a child file their own request but blocks a child decision with 403", async () => {
    const { app } = makeApp();

    // Kids can create requests for themselves.
    const create = await app.inject({ method: "POST", url: "/api/permissions", payload: kidRequest() });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.status).toBe("pending");
    const id = created.id as string;

    // But only adults can decide.
    const childDecision = await app.inject({
      method: "POST",
      url: `/api/permissions/${id}/decision`,
      payload: { actorId: KID, outcome: "approved" },
    });
    expect(childDecision.statusCode).toBe(403);
    expect(childDecision.json().error).toBe("adult role required");

    // The queue surfaces the still-pending request for adults to review.
    const queue = await app.inject({ method: "GET", url: "/api/permissions" });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().pending.map((r: { id: string }) => r.id)).toContain(id);

    const adultDecision = await app.inject({
      method: "POST",
      url: `/api/permissions/${id}/decision`,
      payload: { actorId: YOU, outcome: "approved" },
    });
    expect(adultDecision.statusCode).toBe(200);
    expect(adultDecision.json().request.status).toBe("approved");
  });

  it("14. returns 409 with the conflict message when deciding twice", async () => {
    const { app } = makeApp();
    const create = await app.inject({ method: "POST", url: "/api/permissions", payload: kidRequest() });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;

    const first = await app.inject({
      method: "POST",
      url: `/api/permissions/${id}/decision`,
      payload: { actorId: YOU, outcome: "denied", note: "Not this weekend" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().request.status).toBe("denied");

    const second = await app.inject({
      method: "POST",
      url: `/api/permissions/${id}/decision`,
      payload: { actorId: YOU, outcome: "approved" },
    });
    expect(second.statusCode).toBe(409);
    expect(typeof second.json().error).toBe("string");
    expect(second.json().error).toMatch(/decided/);
  });
});
