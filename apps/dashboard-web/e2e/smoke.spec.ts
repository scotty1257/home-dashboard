import { expect, test } from "@playwright/test";

/**
 * App-shell smoke test: the dashboard chrome (header, main region, bottom
 * nav) must render even when the API is unreachable — React Query keeps the
 * data panels in their loading state without taking down the shell.
 */
test("dashboard chrome renders", async ({ page }) => {
  await page.goto("/");

  // Header (the h-16 app bar).
  await expect(page.getByRole("banner")).toBeVisible();

  // Main content region.
  await expect(page.locator("main")).toBeVisible();

  // Bottom navigation.
  await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
});
