import { expect, test, type Page } from "@playwright/test";

/**
 * The Calendar tab's four views (month / week / day / agenda).
 *
 * Each view is held to the same contract as the rest of the app — 56px touch
 * targets (day cells and time-grid slots exempted, see below), on-scale type,
 * and no horizontal overflow — plus the behaviour that makes the views useful:
 * the filter survives a view switch, the time grid places an event by its
 * duration, and keyboard shortcuts move the anchor date.
 */

const THEMES = ["light", "dark"] as const;

/** Type scale from layout.spec.ts; 16px is the kiosk floor. */
const ON_SCALE = [
  "16px", "18px", "20px", "22px", "24px", "28px", "32px", "40px", "48px", "64px",
];

interface CalendarAudit {
  smallControls: { name: string; height: number }[];
  offScaleText: { tag: string; text: string; fontSize: string }[];
  horizontalOverflow: number;
}

/**
 * Audit the calendar screen.
 *
 * Two exemptions, both documented in the components themselves:
 * `[data-calendar-day]` month cells are sized by the 6-row grid (44px floor,
 * as in layout.spec.ts), and `[data-calendar-slot]` time-grid boxes are sized
 * by their duration in minutes — a 30-minute event is 28px by definition, so a
 * 56px floor would mean lying about when it ends.
 */
async function auditCalendar(page: Page, onScale: string[]): Promise<CalendarAudit> {
  return page.evaluate((scale: string[]) => {
    const smallControls: { name: string; height: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, input, select, [role='slider']")) {
      if (el.getClientRects().length === 0) continue;
      if (el.closest("[hidden]")) continue;
      if (el.hasAttribute("data-calendar-slot")) continue;
      const height = el.getBoundingClientRect().height;
      const floor = el.hasAttribute("data-calendar-day") ? 43.5 : 55.5;
      if (height < floor) {
        smallControls.push({
          name:
            el.getAttribute("aria-label") ??
            ((el.textContent || "").trim().slice(0, 40) || "?"),
          height: Math.round(height * 10) / 10,
        });
      }
    }

    const offScaleText: { tag: string; text: string; fontSize: string }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") continue;
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (!hasText) continue;
      if (el.getClientRects().length === 0) continue;
      const fontSize = getComputedStyle(el).fontSize;
      if (!scale.includes(fontSize)) {
        offScaleText.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().slice(0, 40),
          fontSize,
        });
      }
    }

    return {
      smallControls,
      offScaleText,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  }, onScale);
}

/** Ids seeded by the current test, deleted again in afterEach. */
let seeded: string[] = [];

/** Seed one timed event today so every view has something to render. */
async function seed(
  request: any,
  title: string,
  startHour: number,
  endHour: number,
  extra: Record<string, unknown> = {},
) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, 0, 0);
  const response = await request.post("/api/calendar/events", {
    data: { title, start: start.toISOString(), end: end.toISOString(), ...extra },
  });
  seeded.push((await response.json()).id);
}

/**
 * Remove this file's events again.
 *
 * The suite shares one database, and a month cell shows only the first couple
 * of events on a day. Leaving these behind pushes another spec's freshly
 * created event under the "+N more" fold, which failed layout.spec.ts's chip
 * test rather than this file's.
 */
test.afterEach(async ({ request }) => {
  for (const id of seeded) await request.delete(`/api/calendar/events/${id}`);
  seeded = [];
});

async function openCalendar(page: Page, theme: string) {
  await page.goto(`/?theme=${theme}`);
  await page
    .locator('nav[aria-label="Primary"]')
    .getByRole("button", { name: /^Calendar$/ })
    .click();
  await page.getByRole("group", { name: "Calendar view" }).first().waitFor();
}

/** Click a view button, whichever of the two switchers is visible. */
async function switchTo(page: Page, view: string) {
  await page
    .getByRole("group", { name: "Calendar view" })
    .locator("visible=true")
    .first()
    .getByRole("button", { name: view })
    .click();
  await page.waitForTimeout(200);
}

test.describe("calendar views hold the layout contract", () => {
  for (const view of ["Month", "Week", "Day", "Agenda"]) {
    test(`${view} view: 56px controls, on-scale type, no overflow`, async ({ page, request }) => {
      await seed(request, `${view} contract event`, 10, 11);
      await page.setViewportSize({ width: 1920, height: 1080 });

      for (const theme of THEMES) {
        await openCalendar(page, theme);
        await switchTo(page, view);

        const audit = await auditCalendar(page, ON_SCALE);
        expect(audit.smallControls, `${theme} ${view} sub-56px controls`).toEqual([]);
        expect(audit.offScaleText, `${theme} ${view} off-scale text`).toEqual([]);
        expect(audit.horizontalOverflow, `${theme} ${view} horizontal overflow`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("the filter rail holds the contract too", async ({ page, request }) => {
    await seed(request, "Filter rail event", 9, 10);
    await page.setViewportSize({ width: 1920, height: 1080 });

    for (const theme of THEMES) {
      await openCalendar(page, theme);
      await page.getByRole("button", { name: "Show filters" }).click();
      await page.getByLabel("Search events").waitFor();

      const audit = await auditCalendar(page, ON_SCALE);
      expect(audit.smallControls, `${theme} filter sub-56px controls`).toEqual([]);
      expect(audit.offScaleText, `${theme} filter off-scale text`).toEqual([]);
      expect(audit.horizontalOverflow, `${theme} filter horizontal overflow`).toBeLessThanOrEqual(0);
    }
  });
});

test("the time grid sizes an event by its duration", async ({ page, request }) => {
  await seed(request, "Two hour block", 9, 11);
  await seed(request, "One hour block", 14, 15);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCalendar(page, "light");
  await switchTo(page, "Day");

  const heights = await page.evaluate(() => {
    const find = (title: string) =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-testid='event-chip']")).find((el) =>
        el.textContent?.includes(title),
      );
    const two = find("Two hour block");
    const one = find("One hour block");
    return {
      two: two?.getBoundingClientRect().height ?? 0,
      one: one?.getBoundingClientRect().height ?? 0,
    };
  });

  expect(heights.one).toBeGreaterThan(0);
  // A two-hour event occupies twice the height of a one-hour event.
  expect(heights.two).toBeCloseTo(heights.one * 2, 0);
});

test("overlapping events sit side by side rather than on top of each other", async ({
  page,
  request,
}) => {
  await seed(request, "Overlap A", 9, 11);
  await seed(request, "Overlap B", 10, 12);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCalendar(page, "light");
  await switchTo(page, "Day");

  const boxes = await page.evaluate(() => {
    const find = (title: string) =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-testid='event-chip']"))
        .find((el) => el.textContent?.includes(title))
        ?.getBoundingClientRect();
    const a = find("Overlap A");
    const b = find("Overlap B");
    return a && b
      ? { aLeft: a.left, aRight: a.right, bLeft: b.left, bRight: b.right }
      : null;
  });

  expect(boxes).not.toBeNull();
  // They overlap in time, so their boxes must not overlap horizontally.
  const disjoint = boxes!.aRight <= boxes!.bLeft + 1 || boxes!.bRight <= boxes!.aLeft + 1;
  expect(disjoint, "overlapping events share a column").toBe(true);
});

test("the search filter survives a view switch", async ({ page, request }) => {
  await seed(request, "Piano lesson", 9, 10);
  await seed(request, "Grocery run", 11, 12);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCalendar(page, "light");

  await page.getByRole("button", { name: "Show filters" }).click();
  await page.getByLabel("Search events").fill("Piano");
  await page.waitForTimeout(200);
  await expect(page.getByText("Grocery run")).toHaveCount(0);

  // The filter belongs to the calendar, not to one view.
  await switchTo(page, "Week");
  await expect(page.getByText("Piano lesson").first()).toBeVisible();
  await expect(page.getByText("Grocery run")).toHaveCount(0);

  await switchTo(page, "Agenda");
  await expect(page.getByText("Piano lesson").first()).toBeVisible();
  await expect(page.getByText("Grocery run")).toHaveCount(0);
});

test("keyboard shortcuts switch views and move the date", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCalendar(page, "light");

  const heading = page.getByRole("heading").filter({ hasText: /\w/ }).first();
  const monthTitle = await heading.textContent();

  await page.keyboard.press("w");
  await expect(page.getByRole("button", { name: "Week" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("d");
  await expect(page.getByRole("button", { name: "Day" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Arrows step the anchor by the view's own unit; "t" returns to today.
  const dayTitle = await heading.textContent();
  await page.keyboard.press("ArrowRight");
  await expect(heading).not.toHaveText(dayTitle!);
  await page.keyboard.press("t");
  await expect(heading).toHaveText(dayTitle!);

  await page.keyboard.press("m");
  await expect(heading).toHaveText(monthTitle!);
});

test("typing in the search box does not trigger view shortcuts", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCalendar(page, "light");
  await page.getByRole("button", { name: "Show filters" }).click();

  await page.getByLabel("Search events").fill("wednesday");
  // "w"/"d"/"a" are all shortcuts — the month view must have survived them.
  await expect(page.getByRole("button", { name: "Month" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Search events")).toHaveValue("wednesday");
});

test("the month grid drills into a day", async ({ page, request }) => {
  // Four events on one day forces the "+N more" overflow control.
  for (const [i, title] of ["A", "B", "C", "D"].entries()) {
    await seed(request, `Drill ${title}`, 8 + i, 9 + i);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCalendar(page, "light");

  const more = page.locator("[aria-label^='Show all']").first();
  await expect(more).toBeVisible();
  await more.click();

  await expect(page.getByRole("button", { name: "Day" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
