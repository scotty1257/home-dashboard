import { describe, it, expect } from "vitest";
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

/** Seeded members (family-seeds migration): You/Partner are adults, Kid is a child. */
const YOU = "member-you";
const PARTNER = "member-partner";
const KID = "member-kid";

const START = "2030-01-05T09:00:00.000Z";
const END = "2030-01-05T10:00:00.000Z";

const CONTACT_INPUT = {
  name: "Grandma",
  relationship: "Grandma",
  phone: "555-0100",
  priority: 1,
  active: true,
};

describe("handoff routes", () => {
  it("GET /api/handoffs returns the seeded board shape", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/handoffs" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
    expect(typeof body.from).toBe("string");
    expect(typeof body.to).toBe("string");
  });

  it("GET /api/handoffs rejects invalid ISO range parameters with 400", async () => {
    const { app } = makeApp();
    const from = await app.inject({ method: "GET", url: "/api/handoffs?from=not-a-date" });
    expect(from.statusCode).toBe(400);
    const to = await app.inject({ method: "GET", url: "/api/handoffs?to=nonsense" });
    expect(to.statusCode).toBe(400);
  });

  it("POST /api/handoffs with a child actor returns 403", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/handoffs",
      payload: { eventId: "evt-kid", startsAt: START, endsAt: END, actorId: KID },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("adult role required");
  });

  it("POST /api/handoffs rejects an invalid body with 400", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/handoffs",
      payload: { eventId: "evt-bad", actorId: YOU }, // missing startsAt/endsAt
    });
    expect(res.statusCode).toBe(400);
  });

  it("claims as an adult, then 409 stale for the other adult, 403 for the child, 404 unknown", async () => {
    const { app } = makeApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/handoffs",
      payload: { eventId: "evt-claim", startsAt: START, endsAt: END, actorId: YOU },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;

    const claim = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/claim`,
      payload: { actorId: PARTNER },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().status).toBe("claimed");
    expect(claim.json().assigneeMemberId).toBe(PARTNER);

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/claim`,
      payload: { actorId: YOU },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("stale state");

    const child = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/claim`,
      payload: { actorId: KID },
    });
    expect(child.statusCode).toBe(403);
    expect(child.json().error).toBe("adult role required");

    const missing = await app.inject({
      method: "PATCH",
      url: "/api/handoffs/no-such-handoff/claim",
      payload: { actorId: YOU },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("lists a created obligation with derived board context in an explicit window", async () => {
    const { app } = makeApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/handoffs",
      payload: { eventId: "evt-board", startsAt: START, endsAt: END, actorId: YOU },
    });
    expect(create.statusCode).toBe(201);

    const board = await app.inject({
      method: "GET",
      url: "/api/handoffs?from=2030-01-04T00:00:00.000Z&to=2030-01-06T00:00:00.000Z",
    });
    expect(board.statusCode).toBe(200);
    const item = board
      .json()
      .items.find((i: { eventId: string }) => i.eventId === "evt-board");
    expect(item).toBeDefined();
    expect(item.status).toBe("unclaimed");
    expect(Array.isArray(item.availability)).toBe(true);
    expect(["planned", "night-before", "urgent", "resolved"]).toContain(item.attentionState);
  });

  it("requests backup and resolves as adults; a child is rejected", async () => {
    const { app } = makeApp();
    const contact = await app.inject({
      method: "POST",
      url: "/api/backup-contacts",
      payload: { name: "Neighbor", relationship: "Neighbor", phone: "555-0101", priority: 1, active: true },
    });
    expect(contact.statusCode).toBe(201);
    const contactId = contact.json().id as string;

    const create = await app.inject({
      method: "POST",
      url: "/api/handoffs",
      payload: { eventId: "evt-backup", startsAt: START, endsAt: END, actorId: YOU },
    });
    const id = create.json().id as string;

    const backup = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/request-backup`,
      payload: { actorId: YOU, backupContactId: contactId, note: "Running late" },
    });
    expect(backup.statusCode).toBe(200);
    expect(backup.json().status).toBe("backup-requested");
    expect(backup.json().backupContactId).toBe(contactId);
    expect(backup.json().note).toBe("Running late");

    const childBackup = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/request-backup`,
      payload: { actorId: KID },
    });
    expect(childBackup.statusCode).toBe(403);

    const resolve = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/resolve`,
      payload: { actorId: PARTNER },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().status).toBe("resolved");

    const childResolve = await app.inject({
      method: "PATCH",
      url: `/api/handoffs/${id}/resolve`,
      payload: { actorId: KID },
    });
    expect(childResolve.statusCode).toBe(403);
  });

  it("manages backup contacts over HTTP", async () => {
    const { app } = makeApp();

    const invalid = await app.inject({
      method: "POST",
      url: "/api/backup-contacts",
      payload: { name: "", relationship: "", phone: "", priority: 0, active: true },
    });
    expect(invalid.statusCode).toBe(400);

    const create = await app.inject({
      method: "POST",
      url: "/api/backup-contacts",
      payload: CONTACT_INPUT,
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe("Grandma");
    const id = create.json().id as string;

    const updateMissing = await app.inject({
      method: "PUT",
      url: "/api/backup-contacts/no-such-contact",
      payload: CONTACT_INPUT,
    });
    expect(updateMissing.statusCode).toBe(404);

    const update = await app.inject({
      method: "PUT",
      url: `/api/backup-contacts/${id}`,
      payload: { ...CONTACT_INPUT, phone: "555-0199" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().phone).toBe("555-0199");

    const list = await app.inject({ method: "GET", url: "/api/backup-contacts" });
    expect(list.statusCode).toBe(200);
    const names = list.json().contacts.map((c: { name: string }) => c.name);
    expect(names).toContain("Grandma");
    expect(list.json().contacts[0].phone).toBe("555-0199");
  });
});
