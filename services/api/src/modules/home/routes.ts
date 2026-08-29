import type { FastifyInstance } from "fastify";
import { HomeCommand, HomeSnapshot } from "@home-dashboard/contracts";
import type { Config } from "../../config.js";
import type { Database } from "../../platform/database.js";
import { TtlCache } from "../../platform/cache.js";
import { eventHub, Events } from "../../platform/events.js";
import type { HomeProvider } from "./provider.js";
import { DemoHomeProvider } from "./demoProvider.js";
import { HomeAssistantProvider } from "./homeAssistantProvider.js";

interface Overrides {
  [entityId: string]: {
    favorite?: boolean;
    color?: string;
    alias?: string;
    icon?: string;
    requiresConfirmation?: boolean;
  };
}

const CACHE_TTL = 5000; // 5s snapshot cache; SSE pushes updates sooner.

export interface HomeModule {
  provider: HomeProvider;
  getSnapshot(force?: boolean): Promise<HomeSnapshot>;
  setOverride(entityId: string, patch: Overrides[string]): void;
  overrides(): Overrides;
}

export function createHomeModule(db: Database, config: Config): HomeModule {
  const provider: HomeProvider =
    config.homeAssistant.url && config.homeAssistant.token
      ? new HomeAssistantProvider(
          config.homeAssistant.url,
          config.homeAssistant.token,
          config.homeAssistant.hiddenDomains,
        )
      : new DemoHomeProvider();

  const cache = new TtlCache<HomeSnapshot>();
  let overrides: Overrides = loadOverrides(db);

  function loadOverrides(database: Database): Overrides {
    const row = database
      .prepare(`SELECT value FROM settings WHERE key = 'home.overrides'`)
      .get() as { value: string } | undefined;
    if (!row) return {};
    try {
      return JSON.parse(row.value) as Overrides;
    } catch {
      return {};
    }
  }

  function persistOverrides(): void {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('home.overrides', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(overrides), now);
  }

  function applyOverrides(snapshot: HomeSnapshot): HomeSnapshot {
    const entities = snapshot.entities.map((e) => {
      const o = overrides[e.id];
      if (!o) return e;
      return {
        ...e,
        favorite: o.favorite ?? e.favorite,
        color: (o.color as HomeSnapshot["entities"][number]["color"]) ?? e.color,
        alias: o.alias,
        icon: o.icon,
        requiresConfirmation: o.requiresConfirmation ?? e.requiresConfirmation,
      };
    });
    return { ...snapshot, entities };
  }

  async function getSnapshot(force = false): Promise<HomeSnapshot> {
    const cached = cache.get("home");
    if (cached && !force) return cached;
    try {
      const raw = await provider.snapshot();
      const snapshot = applyOverrides(raw);
      cache.set("home", snapshot, CACHE_TTL);
      return snapshot;
    } catch (err) {
      const stale = cache.getStale("home");
      if (stale) return { ...stale, connected: false };
      throw err;
    }
  }

  return {
    provider,
    getSnapshot,
    overrides: () => overrides,
    setOverride(entityId, patch) {
      overrides[entityId] = { ...(overrides[entityId] ?? {}), ...patch };
      persistOverrides();
      cache.delete("home");
      eventHub.emit(Events.homeStateChanged, { entityId, overrides: patch });
    },
  };
}

export function homeRoutes(app: FastifyInstance, db: Database, mod: HomeModule): void {
  app.get("/api/home", async (_request, reply) => {
    try {
      const snapshot = await mod.getSnapshot();
      return reply.send(snapshot);
    } catch {
      return reply
        .status(502)
        .send({ error: "home provider unreachable", connected: false });
    }
  });

  app.post("/api/home/command", async (request, reply) => {
    const parsed = HomeCommand.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid command", details: parsed.error.flatten() });
    }
    try {
      await mod.provider.execute(parsed.data);
      eventHub.emit(Events.homeStateChanged, { command: parsed.data });
      db.prepare(
        `INSERT INTO audit_log (at, actor, action, entity_id, detail)
         VALUES (?, 'dashboard', ?, ?, ?)`,
      ).run(new Date().toISOString(), parsed.data.action, parsed.data.entityId, JSON.stringify(parsed.data.params));
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(502).send({ error: (err as Error).message });
    }
  });

  app.patch("/api/home/entities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      favorite?: boolean;
      color?: string;
      alias?: string;
      icon?: string;
      requiresConfirmation?: boolean;
    };
    mod.setOverride(id, body);
    return reply.send({ ok: true });
  });
}
