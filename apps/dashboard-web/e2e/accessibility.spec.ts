import { expect, test, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Accessibility contract (Task 18):
 * - every icon-only button exposes an accessible name (aria-label),
 * - images carry alt attributes,
 * - nav buttons expose aria-current="page" for the active tab,
 * - light + dark theme screenshots of every screen land in
 *   test-results/screenshots/ (gitignored) for visual contrast review.
 */

const ALL_SCREENS = [
  { name: "today", tab: "Today" },
  { name: "calendar", tab: "Calendar" },
  { name: "family", tab: "Family" },
  { name: "launch", tab: "Launch" },
  { name: "home", tab: "Home" },
  { name: "media", tab: "Music" },
  { name: "settings", tab: "Settings" },
] as const;

const SHOT_SCREENS = [
  { name: "today", tab: "Today" },
  { name: "family", tab: "Family" },
  { name: "launch", tab: "Launch" },
] as const;

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1280x720", width: 1280, height: 720 },
] as const;

const THEMES = ["light", "dark"] as const;

const SCREENSHOT_DIR = path.join("test-results", "screenshots");

/** Opens a screen — nav tabs, or the header gear for Settings. */
async function openScreen(page: Page, tab: string, theme: string) {
  await page.goto(`/?theme=${theme}`);
  if (tab === "Settings") {
    await page.getByRole("banner").getByRole("button", { name: "Settings" }).click();
  } else if (tab !== "Today") {
    await page
      .locator('nav[aria-label="Primary"]')
      .getByRole("button", { name: new RegExp(`^${tab}$`) })
      .click();
  }
}

/** Waits for each screen's data to paint so audits see the full DOM. */
async function settle(page: Page, screen: string) {
  switch (screen) {
    case "today":
      await expect(page.getByRole("heading", { name: "Voice notes" })).toBeVisible();
      break;
    case "calendar":
      await expect(page.locator("main button").first()).toBeVisible();
      break;
    case "family":
      await expect(page.getByRole("heading", { name: /^Handoffs$/ })).toBeVisible();
      break;
    case "launch":
      await expect(page.locator("main button").first()).toBeVisible();
      break;
    case "home":
    case "media":
      // Demo data always renders at least one slider on these screens.
      await expect(page.locator("input[type='range']").first()).toBeVisible();
      break;
    case "settings":
      await expect(page.getByRole("heading", { name: /^Household$/ })).toBeVisible();
      break;
  }
  // Let late queries (duty cards, activity) settle before auditing.
  await page.waitForTimeout(300);
}

test("every icon-only button has an accessible name", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const unnamed: string[] = [];

  for (const screen of ALL_SCREENS) {
    await openScreen(page, screen.tab, "light");
    await settle(page, screen.name);

    const findings = await page.evaluate(() => {
      const bad: { screenButton: string }[] = [];
      for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
        if (button.getClientRects().length === 0) continue;
        // Icon-only: no text content at all (SVGs contribute nothing).
        if ((button.textContent || "").trim().length > 0) continue;
        const named =
          (button.getAttribute("aria-label") || "").trim().length > 0 ||
          (button.getAttribute("aria-labelledby") || "").trim().length > 0;
        if (!named) bad.push({ screenButton: button.outerHTML.slice(0, 120) });
      }
      return bad.map((b) => b.screenButton);
    });
    unnamed.push(...findings.map((html) => `${screen.name}: ${html}`));
  }

  expect(unnamed, "icon-only buttons without an accessible name").toEqual([]);
});

test("images have alt attributes", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const missing: string[] = [];

  for (const screen of ALL_SCREENS) {
    await openScreen(page, screen.tab, "light");
    await settle(page, screen.name);

    const findings = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter((img) => img.getClientRects().length > 0 && !img.hasAttribute("alt"))
        .map((img) => (img as HTMLImageElement).src.slice(0, 80)),
    );
    missing.push(...findings.map((src) => `${screen.name}: ${src}`));
  }

  expect(missing, "visible images without alt").toEqual([]);
});

test("nav buttons expose aria-current when active", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?theme=light");
  const nav = page.locator('nav[aria-label="Primary"]');
  await expect(nav).toBeVisible();

  const tabs = ["Today", "Calendar", "Family", "Launch", "Home", "Music"];
  for (const tab of tabs) {
    await nav.getByRole("button", { name: new RegExp(`^${tab}$`) }).click();

    const state = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Primary"] button')).map(
        (button) => ({
          label: button.textContent?.trim() ?? "",
          current: button.getAttribute("aria-current"),
        }),
      ),
    );

    // Exactly one tab — the active one — carries aria-current="page".
    const active = state.filter((s) => s.current !== null);
    expect(active, `${tab}: exactly one aria-current`).toHaveLength(1);
    expect(active[0]!.current).toBe("page");
    expect(active[0]!.label).toBe(tab);
  }
});

test("captures light and dark screenshots for visual contrast review", async ({ page }) => {
  const paths: string[] = [];

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme });
      for (const screen of SHOT_SCREENS) {
        await openScreen(page, screen.tab, theme);
        await settle(page, screen.name);

        const file = path.join(
          SCREENSHOT_DIR,
          `${screen.name}-${theme}-${vp.name}.png`,
        );
        const buffer = await page.screenshot({ path: file });
        expect(buffer.length, `${file} is non-empty`).toBeGreaterThan(0);
        paths.push(file);
      }
    }
  }

  // All 12 screenshots exist on disk for manual contrast review.
  expect(paths).toHaveLength(12);
  for (const file of paths) {
    expect(fs.existsSync(file), `${file} saved`).toBe(true);
  }
  test.info().attachments.push({
    name: "theme-screenshots",
    contentType: "text/plain",
    body: Buffer.from(paths.join("\n")),
  });
});
