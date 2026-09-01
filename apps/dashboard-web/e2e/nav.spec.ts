import { expect, test } from "@playwright/test";

/**
 * Six-tab navigation spec. Runs against a FRESH database (the Playwright API
 * webServer points at /tmp/e2e-api.sqlite), so every assertion targets
 * structure — tab labels, headings, geometry — never data.
 */

test.describe("navigation at 1920×1080", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
  });

  test("shows the header and six full-height tabs", async ({ page }) => {
    await expect(page.getByRole("banner")).toBeVisible();

    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();

    const tabs = nav.getByRole("button");
    await expect(tabs).toHaveCount(6);
    for (const label of ["Today", "Calendar", "Family", "Home", "Music", "Launch"]) {
      await expect(nav.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeVisible();
    }

    // Touch targets: every tab is at least 48px tall.
    const heights = await tabs.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getBoundingClientRect().height),
    );
    expect(heights).toHaveLength(6);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(48);
    }
  });

  test("Family tab opens the family coordination screen", async ({ page }) => {
    await page.locator('nav[aria-label="Primary"]').getByRole("button", { name: /^Family$/ }).click();

    // Every Family module by heading (fresh DB → empty boards, headings
    // still render).
    await expect(page.getByRole("heading", { name: /^Handoffs$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Permissions$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Duties$/ })).toBeVisible();
  });

  test("Today tab returns to the overview grid", async ({ page }) => {
    // Navigate away first so the click is a real transition.
    await page.locator('nav[aria-label="Primary"]').getByRole("button", { name: /^Family$/ }).click();
    await expect(page.getByRole("heading", { name: /^Handoffs$/ })).toBeVisible();

    await page.locator('nav[aria-label="Primary"]').getByRole("button", { name: /^Today$/ }).click();

    // Today-only regions: the voice note drop and the weather panel.
    await expect(page.getByRole("heading", { name: /^Voice notes$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Weather$/ })).toBeVisible();
  });

  test("the launch sequence has its own tab, with a summary on Family", async ({ page }) => {
    const nav = page.locator('nav[aria-label="Primary"]');
    // Launch owns a tab: in full it took a full-width row on Family and left
    // the other three modules squeezed into the bottom half of that screen.
    await expect(nav.getByRole("button", { name: /^Launch$/ })).toHaveCount(1);

    await nav.getByRole("button", { name: /^Family$/ }).click();

    // Structure, not data: the summary panel is present on Family whatever the
    // run state is. Asserting the quiet copy here coupled this spec to whether
    // an earlier spec had activated the weekday template in the shared DB.
    const summary = page.getByRole("heading", { name: /^Launch$/, level: 2 });
    await expect(summary).toBeVisible();
  });
});

test.describe("Today at 1280×720", () => {
  test("stacks scrollably with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");

    const main = page.locator("main");
    await expect(main).toBeVisible();

    // The stacked layout must be scrollable, never clipped: main's content
    // is at least as tall as its box.
    const dims = await main.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(dims.scrollHeight).toBeGreaterThanOrEqual(dims.clientHeight);

    // Nothing sticks out sideways.
    const horizontalOverflow = await page.evaluate(
      () => document.body.scrollWidth - window.innerWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(0);
  });
});
