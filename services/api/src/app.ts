import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Config } from "./config.js";
import { Database } from "./platform/database.js";
import { eventHub } from "./platform/events.js";
import { CalendarRepository } from "./modules/calendar/repository.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { weatherRoutes } from "./modules/weather/routes.js";
import { createWeatherDeps } from "./modules/voice-actions/weatherDeps.js";
import { createHomeModule, homeRoutes } from "./modules/home/routes.js";
import { SpotifyModule, spotifyRoutes } from "./modules/spotify/routes.js";
import { activityRoutes } from "./modules/activity/routes.js";
import { ToolRegistry } from "./modules/voice-actions/toolRegistry.js";
import { voiceActionRoutes } from "./modules/voice-actions/routes.js";
import { SettingsStore, settingsRoutes } from "./modules/settings/routes.js";
import { HouseholdRepository } from "./modules/household/repository.js";
import { householdRoutes } from "./modules/household/routes.js";
import { HandoffRepository } from "./modules/handoffs/repository.js";
import { handoffRoutes } from "./modules/handoffs/routes.js";

export interface AppContext {
  app: FastifyInstance;
  db: Database;
  calendar: CalendarRepository;
  home: ReturnType<typeof createHomeModule>;
  spotify: SpotifyModule;
  settings: SettingsStore;
  tools: ToolRegistry;
  household: HouseholdRepository;
  handoffs: HandoffRepository;
}

export function buildApp(config: Config): AppContext {
  const app = Fastify({ logger: { level: "info" } });
  const db = new Database(config.databasePath);

  app.register(cors, { origin: true });

  const calendar = new CalendarRepository(db);
  const weatherDeps = createWeatherDeps(config);
  const home = createHomeModule(db, config);
  const spotify = new SpotifyModule(db, config);
  const settings = new SettingsStore(db);
  const household = new HouseholdRepository(db);
  const handoffs = new HandoffRepository(db, calendar, household, settings);
  const tools = new ToolRegistry({ calendar, spotify, home, weather: weatherDeps });

  // Health
  app.get("/api/health", async () => {
    const services = [
      { service: "api", status: "ok" as const, checkedAt: new Date().toISOString() },
      {
        service: "home",
        status: home.provider.name === "demo" ? ("ok" as const) : ("ok" as const),
        detail: home.provider.name,
        checkedAt: new Date().toISOString(),
      },
      {
        service: "spotify",
        status: spotify.authorized ? ("ok" as const) : ("degraded" as const),
        detail: spotify.configured ? (spotify.authorized ? "authorized" : "not authorized") : "not configured",
        checkedAt: new Date().toISOString(),
      },
      {
        service: "weather",
        status: "ok" as const,
        detail: "open-meteo",
        checkedAt: new Date().toISOString(),
      },
    ];
    return { services };
  });

  // Server-sent events for live updates.
  app.get("/api/events", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 2000\n\n");

    const send = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    const unsubscribe = eventHub.subscribe(send);
    const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // Feature modules
  calendarRoutes(app, calendar);
  weatherRoutes(app, weatherDeps);
  homeRoutes(app, db, home);
  spotifyRoutes(app, spotify);
  activityRoutes(app, { calendar, spotify, home });
  settingsRoutes(app, settings);
  voiceActionRoutes(app, db, tools);
  householdRoutes(app, household);
  handoffRoutes(app, handoffs);

  return { app, db, calendar, home, spotify, settings, tools, household, handoffs };
}
