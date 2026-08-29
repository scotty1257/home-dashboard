import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  weather: {
    latitude: number;
    longitude: number;
    units: "imperial" | "metric";
    refreshMinutes: number;
  };
  homeAssistant: {
    url: string;
    token: string;
    hiddenDomains: string[];
  };
  spotify: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  voice: {
    port: number;
  };
}

function resolveDbPath(raw: string): string {
  if (raw === ":memory:") return raw;
  if (raw.startsWith("./") || raw.startsWith("../") || !path.isAbsolute(raw)) {
    return path.resolve(repoRoot, raw || "./var/dashboard.sqlite");
  }
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.API_HOST ?? "127.0.0.1",
    port: num(env.API_PORT, 8787),
    databasePath: resolveDbPath(env.DATABASE_PATH ?? "./var/dashboard.sqlite"),
    weather: {
      latitude: num(env.WEATHER_LATITUDE, 40.7128),
      longitude: num(env.WEATHER_LONGITUDE, -74.006),
      units: env.WEATHER_UNITS === "metric" ? "metric" : "imperial",
      refreshMinutes: num(env.WEATHER_REFRESH_MINUTES, 15),
    },
    homeAssistant: {
      url: (env.HA_URL ?? "").replace(/\/+$/, ""),
      token: env.HA_TOKEN ?? "",
      hiddenDomains: (env.HA_HIDDEN_DOMAINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    spotify: {
      clientId: env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: env.SPOTIFY_CLIENT_SECRET ?? "",
      redirectUri: env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8787/api/spotify/callback",
    },
    voice: {
      port: num(env.VOICE_PORT, 8788),
    },
  };
}
