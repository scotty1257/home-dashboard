import { defineConfig } from "@playwright/test";

/**
 * E2E config for the dashboard web app.
 *
 * Uses the system Chrome install (`channel: "chrome"`) — the workspace has no
 * downloaded Playwright browser cache. The nav/layout specs assert app
 * structure against a FRESH isolated database, so the API webServer points
 * at a throwaway SQLite file + voice-note dir under /tmp.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
    baseURL: "http://localhost:5173",
  },
  projects: [
    {
      name: "chromium",
      use: { channel: "chrome" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @home-dashboard/api dev",
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: "8787",
        DATABASE_PATH: "/tmp/e2e-api.sqlite",
        VOICE_NOTE_DIR: "/tmp/e2e-voice-notes",
      },
    },
    {
      command: "pnpm --filter @home-dashboard/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
