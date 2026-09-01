import { test, expect } from "@playwright/test";

/** Every modal must cover the viewport, not its parent card. */
async function checkOpenDialog(page: any, label: string) {
  const info = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const backdrop = dialog.parentElement as HTMLElement;
    const r = backdrop.getBoundingClientRect();
    return {
      covers:
        r.width >= window.innerWidth - 1 &&
        r.height >= window.innerHeight - 1 &&
        r.x <= 1 && r.y <= 1,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
      parent: backdrop.parentElement?.tagName.toLowerCase(),
    };
  });
  console.log(`MODAL ${label}`, JSON.stringify(info));
  expect(info, label).not.toBeNull();
  expect(info.covers, `${label} covers viewport (${info.rect})`).toBe(true);
  expect(["body", "html"], `${label} portalled out of the card`).toContain(info.parent);
}

/**
 * Modals must cover the viewport, not the card that opened them.
 *
 * `position: fixed` resolves against the nearest ancestor establishing a
 * containing block, and `Panel` carries `backdrop-blur-md`. A sheet rendered
 * inside a panel was therefore clamped to that card (measured 606×1008 at
 * (25,378) rather than covering 1920×1080), so opening "New handoff" or a
 * calendar event required scrolling to find the dialog. Every overlay is
 * portalled to document.body; this guards that, and catches any new
 * transform/filter ancestor that would trap them again.
 */
test("all modals cover the viewport, not their parent card", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?theme=light");
  const nav = page.locator('nav[aria-label="Primary"]');

  // Calendar: event editor, opened from a month-grid day cell.
  await nav.getByRole("button", { name: /^Calendar$/ }).click();
  await page.locator("[data-calendar-day]").first().click();
  await page.locator('[role="dialog"]').waitFor();
  await checkOpenDialog(page, "calendar event editor");
  await page.keyboard.press("Escape");

  // Today: the week agenda's day rows open the same editor.
  await nav.getByRole("button", { name: /^Today$/ }).click();
  await page.getByRole("heading", { name: "This week" }).waitFor();
  await page.locator('[data-testid="event-chip"], button[aria-label^="Add an event"]').first().click();
  await page.locator('[role="dialog"]').waitFor();
  await checkOpenDialog(page, "week agenda event editor");
  await page.keyboard.press("Escape");

  // Family: new handoff, add contact, permissions, duties.
  await nav.getByRole("button", { name: /^Family$/ }).click();
  for (const [btn, label] of [
    ["New handoff", "new handoff"],
    ["Add contact", "backup contact"],
    ["New request", "permission request"],
    ["Standing rules", "standing rules"],
    ["Add duty", "duty editor"],
  ] as const) {
    const b = page.getByRole("button", { name: btn });
    if (!(await b.count())) { console.log(`SKIP ${label}`); continue; }
    await b.first().click();
    await page.locator('[role="dialog"]').waitFor();
    await checkOpenDialog(page, label);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // Launch template editor.
  await nav.getByRole("button", { name: /^Launch$/ }).click();
  await page.getByRole("button", { name: /^(Edit|Set up)$/ }).click();
  await page.locator('[role="dialog"]').waitFor();
  await checkOpenDialog(page, "launch template");
  await page.keyboard.press("Escape");

  // Voice overlay + notification drawer.
  await page.getByRole("button", { name: "Open voice assistant" }).click();
  await page.locator('[role="dialog"]').waitFor();
  await checkOpenDialog(page, "voice overlay");
  await page.keyboard.press("Escape");

  await page.getByRole("banner").getByRole("button", { name: /^Notifications/ }).click();
  await page.locator('[role="dialog"]').waitFor();
  await checkOpenDialog(page, "notification drawer");
});
