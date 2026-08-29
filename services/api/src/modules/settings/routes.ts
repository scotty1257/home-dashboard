import type { FastifyInstance } from "fastify";
import { DashboardSettings, DashboardSettingsPatch } from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";

const SETTINGS_KEY = "dashboard.settings";

export const DEFAULT_SETTINGS: DashboardSettings = {
  theme: "dark",
  locale: "en-US",
  timezone: "UTC",
  temperatureUnits: "imperial",
  weatherLocation: null,
  defaultCalendarView: "month",
  nightModeEnabled: false,
  nightDimStart: "22:00",
  nightDimEnd: "07:00",
  voice: { wakeWordEnabled: false, pushToTalkEnabled: true, confirmHighRisk: true },
  accentColor: "coral",
};

export class SettingsStore {
  constructor(private db: Database) {}

  get(): DashboardSettings {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(SETTINGS_KEY) as { value: string } | undefined;
    if (!row) return DEFAULT_SETTINGS;
    try {
      const parsed = DashboardSettings.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  set(patch: DashboardSettingsPatch): DashboardSettings {
    const merged = DashboardSettings.parse({ ...this.get(), ...patch });
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(SETTINGS_KEY, JSON.stringify(merged), new Date().toISOString());
    eventHub.emit(Events.settingsChanged, merged);
    return merged;
  }
}

export function settingsRoutes(app: FastifyInstance, store: SettingsStore): void {
  app.get("/api/settings", async (_request, reply) => {
    return reply.send(store.get());
  });

  app.put("/api/settings", async (request, reply) => {
    const parsed = DashboardSettingsPatch.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid settings", details: parsed.error.flatten() });
    }
    return reply.send(store.set(parsed.data));
  });
}
