import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, type AppContext } from "../../app.js";
import { loadConfig } from "../../config.js";

function makeApp(): AppContext {
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
const KID = "member-kid";

/**
 * Pinned "now": 19:00 UTC on Jan 5 2030 — past the 18:00 night-before alert
 * time for handoffs starting the next day (settings defaults: UTC + 18:00).
 */
const NOW = new Date("2030-01-05T19:00:00.000Z");
/** Tomorrow 09:00 UTC — the handoff that needs claiming tonight. */
const TOMORROW_START = "2030-01-06T09:00:00.000Z";
const TOMORROW_END = "2030-01-06T10:00:00.000Z";

beforeEach(() => {
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Seed one child-commitment event that requires a handoff, plus its obligation. */
function seedHandoff(ctx: AppContext, title: string, start: string, end: string) {
  const event = ctx.calendar.create({
    title,
    start,
    end,
    ownerId: KID,
    scheduleKind: "child-commitment",
    requiresHandoff: true,
  });
  const obligation = ctx.handoffs.create({ eventId: event.id, startsAt: start, endsAt: end, actorId: YOU });
  return { event, obligation };
}

describe("activity feed family alerts", () => {
  it("ranks an unclaimed night-before handoff above ordinary upcoming events", async () => {
    const ctx = makeApp();
    const { event, obligation } = seedHandoff(ctx, "Pickup", TOMORROW_START, TOMORROW_END);

    const res = await ctx.app.inject({ method: "GET", url: "/api/activity" });
    expect(res.statusCode).toBe(200);
    const feed = res.json();

    const first = feed.items[0];
    expect(first.kind).toBe("family-alert");
    expect(first.title).toBe("Unclaimed: Pickup 9:00 AM");
    expect(first.subtitle).toBe("Sunday handoff needs an adult");
    expect(first.severity).toBe("warning");
    expect(first.at).toBe(TOMORROW_START);
    expect(first.ref).toBe(obligation.id);

    // The same event also appears as a plain upcoming entry — ranked below.
    const upcoming = feed.items.find(
      (i: { kind: string; ref?: string }) => i.kind === "event-upcoming" && i.ref === event.id,
    );
    expect(upcoming).toBeDefined();
    expect(feed.items.indexOf(first)).toBeLessThan(feed.items.indexOf(upcoming));
  });

  it("sorts urgent above night-before and keeps ordinary items below all alerts", async () => {
    const ctx = makeApp();
    const urgentStart = new Date(NOW.getTime() + 1 * 60_000).toISOString();
    const urgentEnd = new Date(NOW.getTime() + 61 * 60_000).toISOString();
    seedHandoff(ctx, "Swim pickup", urgentStart, urgentEnd);
    seedHandoff(ctx, "Pickup", TOMORROW_START, TOMORROW_END);

    const res = await ctx.app.inject({ method: "GET", url: "/api/activity" });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;

    expect(items[0].kind).toBe("family-alert");
    expect(items[0].severity).toBe("alert");
    expect(items[0].title).toContain("Swim pickup");
    expect(items[1].kind).toBe("family-alert");
    expect(items[1].severity).toBe("warning");
    expect(items[1].title).toContain("Pickup");
    // Every non-family-alert item sits below the alert block.
    const firstNonAlert = items.findIndex((i: { kind: string }) => i.kind !== "family-alert");
    expect(firstNonAlert).toBeGreaterThan(1);
  });

  it("summarizes waiting permission requests as one notice", async () => {
    const ctx = makeApp();
    ctx.permissions.create({
      childId: KID,
      category: "outing",
      question: "Can I go to Maya's after school?",
      createdBy: KID,
    });
    ctx.permissions.create({
      childId: KID,
      category: "screen-time",
      question: "30 more minutes of iPad?",
      createdBy: KID,
    });

    const res = await ctx.app.inject({ method: "GET", url: "/api/activity" });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;

    const notices = items.filter(
      (i: { kind: string; title: string }) => i.kind === "family-alert" && i.title.includes("permission"),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].severity).toBe("notice");
    expect(notices[0].title).toBe("2 permission requests waiting");
  });

  it("caps handoff alerts at three items", async () => {
    const ctx = makeApp();
    for (let i = 0; i < 5; i++) {
      const start = new Date(new Date(TOMORROW_START).getTime() + i * 3_600_000).toISOString();
      const end = new Date(new Date(start).getTime() + 3_600_000).toISOString();
      seedHandoff(ctx, `Pickup ${i + 1}`, start, end);
    }

    const res = await ctx.app.inject({ method: "GET", url: "/api/activity" });
    expect(res.statusCode).toBe(200);
    const handoffAlerts = res.json().items.filter(
      (i: { kind: string; title: string }) => i.kind === "family-alert" && i.title.startsWith("Unclaimed:"),
    );
    expect(handoffAlerts).toHaveLength(3);
  });

  it("omits family alerts entirely when nothing needs attention", async () => {
    const ctx = makeApp();
    // A claimed, resolved obligation plus an ordinary event: no alerts.
    const { obligation } = seedHandoff(ctx, "Pickup", TOMORROW_START, TOMORROW_END);
    ctx.handoffs.claim(obligation.id, YOU);
    ctx.calendar.create({
      title: "Dinner",
      start: new Date(NOW.getTime() + 3 * 3_600_000).toISOString(),
      end: new Date(NOW.getTime() + 4 * 3_600_000).toISOString(),
    });

    const res = await ctx.app.inject({ method: "GET", url: "/api/activity" });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.some((i: { kind: string }) => i.kind === "family-alert")).toBe(false);
    expect(items.some((i: { kind: string }) => i.kind === "event-upcoming")).toBe(true);
  });
});
