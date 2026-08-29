import type { WeatherReport } from "@home-dashboard/contracts";
import type { Config } from "../../config.js";
import { TtlCache } from "../../platform/cache.js";
import { eventHub, Events } from "../../platform/events.js";
import { fetchOpenMeteo } from "../weather/openMeteo.js";

/** Weather access shared by the weather routes and the voice tool registry. */
export interface WeatherDeps {
  getReport(force?: boolean): Promise<WeatherReport>;
}

/** A synthetic fallback report so the dashboard still renders offline. */
export function demoReport(units: "imperial" | "metric"): WeatherReport {
  const now = new Date();
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    time: new Date(now.getTime() + i * 3_600_000).toISOString(),
    temperature:
      units === "imperial" ? 68 + Math.round(Math.sin(i / 3) * 8) : 20 + Math.round(Math.sin(i / 3) * 4),
    condition: "partly-cloudy" as const,
    precipitationProbability: i > 12 && i < 18 ? 45 : 10,
  }));
  return {
    location: "Demo location",
    units,
    current: {
      temperature: units === "imperial" ? 72 : 22,
      feelsLike: units === "imperial" ? 74 : 23,
      condition: "partly-cloudy",
      humidity: 58,
      windSpeed: units === "imperial" ? 9 : 14,
      windDirection: 210,
      precipitation: 0,
      pressure: 1013,
      isDay: true,
      updatedAt: now.toISOString(),
    },
    hourly,
    daily: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(now.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      high: units === "imperial" ? 76 : 24,
      low: units === "imperial" ? 60 : 16,
      condition: i === 3 ? ("rain" as const) : ("clear" as const),
      precipitationProbability: i === 3 ? 70 : 15,
    })),
    alerts: [],
    stale: true,
  };
}

export function createWeatherDeps(config: Config): WeatherDeps {
  const cache = new TtlCache<WeatherReport>();
  const CACHE_KEY = "weather";

  return {
    async getReport(force = false) {
      const ttl = config.weather.refreshMinutes * 60_000;
      const cached = cache.get(CACHE_KEY);
      if (cached && !force) {
        eventHub.emit(Events.weatherUpdated, { stale: false });
        return cached;
      }
      try {
        const report = await fetchOpenMeteo({
          latitude: config.weather.latitude,
          longitude: config.weather.longitude,
          units: config.weather.units,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "auto",
        });
        cache.set(CACHE_KEY, report, ttl);
        eventHub.emit(Events.weatherUpdated, { stale: false });
        return report;
      } catch {
        const stale = cache.getStale(CACHE_KEY);
        if (stale) {
          eventHub.emit(Events.weatherUpdated, { stale: true });
          return { ...stale, stale: true };
        }
        eventHub.emit(Events.weatherUpdated, { stale: true });
        return demoReport(config.weather.units);
      }
    },
  };
}
