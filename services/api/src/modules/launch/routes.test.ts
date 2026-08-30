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

/**
 * Monday 2026-03-09 06:30 UTC: inside the seeded weekday template's window
 * (zone defaults to UTC). The `at` query override pins `current` to it
 * regardless of the real clock backing the app.
 */
const MONDAY = "2026-03-09T06:30:00.000Z";

function currentRunId(app: ReturnType<typeof makeApp>["app"]): Promise<string> {
  return app
    .inject({ method: "GET", url: `/api/launch/current?at=${MONDAY}` })
    .then((res) => res.json().run.id as string);
}

function toggle(app: ReturnType<typeof makeApp>["app"], runId: string, stepId: string, actorId: string) {
  return app.inject({
    method: "POST",
    url: `/api/launch/runs/${runId}/steps/${stepId}/toggle`,
    payload: { actorId },
  });
}

describe("launch routes", () => {
  it("serves the current launch state, honoring the at override", async () => {
    const { app } = makeApp();

    const ok = await app.inject({ method: "GET", url: `/api/launch/current?at=${MONDAY}` });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.run.id).toEqual(expect.any(String));
    expect(body.run.departureAt).toBe("2026-03-09T08:00:00.000Z");
    expect(body.run.serviceDate).toBe("2026-03-09");
    expect(body.template.id).toBe("launch-weekday");
    expect(body.steps.map((s: { label: string }) => s.label)).toEqual(["Shoes", "Bag", "Snack"]);
    expect(body.nowIso).toBe(MONDAY);

    // Repeat calls resolve to the same run for the same date.
    const again = await app.inject({ method: "GET", url: `/api/launch/current?at=${MONDAY}` });
    expect(again.json().run.id).toBe(body.run.id);

    // Without the override the live clock still answers.
    const live = await app.inject({ method: "GET", url: "/api/launch/current" });
    expect(live.statusCode).toBe(200);
    expect(typeof live.json().nowIso).toBe("string");

    // Invalid override → 400.
    const bad = await app.inject({ method: "GET", url: "/api/launch/current?at=not-a-date" });
    expect(bad.statusCode).toBe(400);

    // Saturday 2026-03-14: the weekday template does not own the date.
    const saturday = await app.inject({
      method: "GET",
      url: "/api/launch/current?at=2026-03-14T10:00:00.000Z",
    });
    expect(saturday.statusCode).toBe(200);
    expect(saturday.json().run).toBeNull();
    expect(saturday.json().template).toBeNull();
    expect(saturday.json().steps).toEqual([]);
  });

  it("toggles steps over HTTP: happy cycle, 403/404/400", async () => {
    const { app } = makeApp();
    const runId = await currentRunId(app);

    // Child actors are rejected before anything is written.
    const child = await toggle(app, runId, "launch-step-shoes", KID);
    expect(child.statusCode).toBe(403);
    expect(child.json().error).toBe("adult role required");

    const missingRun = await toggle(app, "no-such-run", "launch-step-shoes", YOU);
    expect(missingRun.statusCode).toBe(404);

    const missingStep = await toggle(app, runId, "no-such-step", YOU);
    expect(missingStep.statusCode).toBe(404);

    const invalid = await app.inject({
      method: "POST",
      url: `/api/launch/runs/${runId}/steps/launch-step-shoes/toggle`,
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);

    // A step of a different template is not part of this run.
    const created = await app.inject({
      method: "POST",
      url: "/api/launch/templates",
      payload: {
        childId: KID,
        name: "Weekend launch",
        weekdays: [0, 6],
        departureLocalTime: "09:00",
        active: true,
        steps: [{ label: "Water bottle", icon: "water" }],
        actorId: YOU,
      },
    });
    expect(created.statusCode).toBe(201);
    const foreignStepId = created.json().steps[0].id;
    const foreign = await toggle(app, runId, foreignStepId, YOU);
    expect(foreign.statusCode).toBe(404);

    // Happy cycle: complete all three, then undo one.
    const one = await toggle(app, runId, "launch-step-shoes", YOU);
    expect(one.statusCode).toBe(200);
    expect(one.json().run.completedStepIds).toEqual(["launch-step-shoes"]);

    const two = await toggle(app, runId, "launch-step-bag", PARTNER);
    expect(two.json().run.completedStepIds).toEqual(["launch-step-shoes", "launch-step-bag"]);

    const three = await toggle(app, runId, "launch-step-snack", YOU);
    expect(three.json().run.completedStepIds).toHaveLength(3);
    expect(three.json().run.completedAt).toEqual(expect.any(String));

    const undo = await toggle(app, runId, "launch-step-snack", YOU);
    expect(undo.statusCode).toBe(200);
    expect(undo.json().run.completedAt).toBeNull();
    expect(undo.json().run.completedStepIds).toEqual(["launch-step-shoes", "launch-step-bag"]);
  });

  it("acknowledges the chime once (409 after) and resets, adults only", async () => {
    const { app } = makeApp();
    const runId = await currentRunId(app);

    const first = await app.inject({
      method: "POST",
      url: `/api/launch/runs/${runId}/chime-played`,
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().run.chimePlayedAt).toEqual(expect.any(String));

    const second = await app.inject({
      method: "POST",
      url: `/api/launch/runs/${runId}/chime-played`,
      payload: {},
    });
    expect(second.statusCode).toBe(409);

    const missing = await app.inject({
      method: "POST",
      url: "/api/launch/runs/no-such-run/chime-played",
      payload: {},
    });
    expect(missing.statusCode).toBe(404);

    const childReset = await app.inject({
      method: "POST",
      url: `/api/launch/runs/${runId}/reset`,
      payload: { actorId: KID },
    });
    expect(childReset.statusCode).toBe(403);

    const reset = await app.inject({
      method: "POST",
      url: `/api/launch/runs/${runId}/reset`,
      payload: { actorId: YOU },
    });
    expect(reset.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: `/api/launch/current?at=${MONDAY}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().run.id).toBe(runId);
    expect(after.json().run.completedStepIds).toEqual([]);
    expect(after.json().run.chimePlayedAt).toBeNull();
    expect(after.json().run.completedAt).toBeNull();
    expect(after.json().run.status).toBe("active");
  });

  it("manages templates over HTTP: list, create, update, errors", async () => {
    const { app } = makeApp();

    const list = await app.inject({ method: "GET", url: "/api/launch/templates" });
    expect(list.statusCode).toBe(200);
    const seeded = list
      .json()
      .templates.find((t: { id: string }) => t.id === "launch-weekday");
    expect(seeded.steps.map((s: { label: string }) => s.label)).toEqual(["Shoes", "Bag", "Snack"]);

    const child = await app.inject({
      method: "POST",
      url: "/api/launch/templates",
      payload: {
        childId: KID,
        name: "X",
        weekdays: [1],
        departureLocalTime: "08:00",
        active: true,
        actorId: KID,
      },
    });
    expect(child.statusCode).toBe(403);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/launch/templates",
      payload: { childId: KID, name: "", weekdays: [], departureLocalTime: "25:00", actorId: YOU },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/launch/templates",
      payload: {
        childId: KID,
        name: "Weekend launch",
        weekdays: [0, 6],
        departureLocalTime: "09:00",
        activeWindowMinutes: 30,
        chimeBeforeMinutes: 5,
        active: true,
        steps: [{ label: "Water bottle", icon: "water" }],
        actorId: YOU,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe("Weekend launch");
    expect(created.json().activeWindowMinutes).toBe(30);
    expect(created.json().steps).toHaveLength(1);

    const childPut = await app.inject({
      method: "PUT",
      url: `/api/launch/templates/${created.json().id}`,
      payload: {
        childId: KID,
        name: "Weekend launch",
        weekdays: [0, 6],
        departureLocalTime: "09:00",
        active: true,
        actorId: KID,
      },
    });
    expect(childPut.statusCode).toBe(403);

    const updated = await app.inject({
      method: "PUT",
      url: "/api/launch/templates/launch-weekday",
      payload: {
        childId: KID,
        name: "Weekday launch",
        weekdays: [1, 2, 3, 4, 5],
        departureLocalTime: "08:15",
        active: true,
        actorId: PARTNER,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().departureLocalTime).toBe("08:15");

    // The departure edit propagates into the run served by current().
    const cur = await app.inject({ method: "GET", url: `/api/launch/current?at=${MONDAY}` });
    expect(cur.json().run.departureAt).toBe("2026-03-09T08:15:00.000Z");

    const missing = await app.inject({
      method: "PUT",
      url: "/api/launch/templates/no-such-template",
      payload: {
        childId: KID,
        name: "Weekday launch",
        weekdays: [1, 2, 3, 4, 5],
        departureLocalTime: "08:00",
        active: true,
        actorId: YOU,
      },
    });
    expect(missing.statusCode).toBe(404);
  });
});
