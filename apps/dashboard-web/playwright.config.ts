import { defineConfig } from "@playwright/test";

/**
 * E2E config for the dashboard web app.
 *
 * Uses the system Chrome install (`channel: "chrome"`) — the workspace has no
 * downloaded Playwright browser cache. The e2e suite does not require the API
 * service: the app renders its shell (header/main/nav) while React Query
 * requests stay in their loading state.
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
  webServer: {
    command: "pnpm --filter @home-dashboard/web dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
