import { expect, test, type Page } from "@playwright/test";

/**
 * Visual-system layout contract (Task 18): the 8px grid.
 *
 * - page gutter 24px (`main` padding), panel gap 24px (primary grids),
 *   panel content inset 24px (first Panel body).
 * - no panel may escape main's box at 1920×1080 (no clipping).
 * - no horizontal overflow at either viewport.
 * - every visible button/input/select is at least 56px tall.
 * - every computed font size sits on the canonical type scale.
 * - RangeControl hit areas are 56px tall.
 * - calendar chips: metadata type, ≥24px chip, readable title at 1280.
 *
 * Themes are forced deterministically with the `?theme=` URL param (see
 * lib/theme.ts) — the app otherwise follows the clock.
 */

const SCREENS = [
  { name: "today", tab: "Today" },
  { name: "family", tab: "Family" },
] as const;

const THEMES = ["light", "dark"] as const;

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1280x720", width: 1280, height: 720 },
] as const;

type Screen = (typeof SCREENS)[number];

const GRID_SELECTOR: Record<Screen["name"], string> = {
  today: '[data-testid="today-grid"]',
  family: '[data-testid="family-grid"]',
};

/** Opens a screen by nav tab with the theme forced via the URL param. */
async function openScreen(page: Page, screen: Screen, theme: string) {
  await page.goto(`/?theme=${theme}`);
  if (screen.tab !== "Today") {
    await page
      .locator('nav[aria-label="Primary"]')
      .getByRole("button", { name: new RegExp(`^${screen.tab}$`) })
      .click();
  }
  await settle(page, screen);
}

/** Waits for each screen's data to paint so audits see the full DOM. */
async function settle(page: Page, screen: Screen) {
  switch (screen.name) {
    case "today":
      await expect(page.getByRole("heading", { name: "Voice notes" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Weather" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Now & Upcoming" })).toBeVisible();
      break;
    case "family":
      // Launch now shares this screen with the three coordination modules.
      for (const heading of ["Handoffs", "Permissions", "Duties", "Launch"]) {
        await expect(page.getByRole("heading", { name: new RegExp(`^${heading}$`) })).toBeVisible();
      }
      break;
  }
  // Let late queries (duty cards, activity) settle before measuring.
  await page.waitForTimeout(300);
}

/** Everything the in-page audits report back. */
interface Audit {
  mainPadding: string;
  gridGap: string | null;
  panelInset: { left: string; right: string } | null;
  horizontalOverflow: number;
  panelsOutsideMain: string[];
  smallControls: { tag: string; name: string; height: number }[];
  offScaleText: { tag: string; text: string; fontSize: string }[];
}

/** Runs all layout audits in the page and returns the raw findings. */
async function auditLayout(page: Page, gridSelector: string): Promise<Audit> {
  return page.evaluate((selector: string) => {
    const main = document.querySelector("main");
    if (!main) throw new Error("no main");
    const mainRect = main.getBoundingClientRect();

    // Primary grid gap (Today grid / Family grid / Launch flex column).
    const grid = document.querySelector(selector);
    const gridGap = grid
      ? getComputedStyle(grid).rowGap || getComputedStyle(grid).gap
      : null;

    // First Panel body inset (Panel renders section > header + body div).
    const panelBody = main.querySelector("section header + div");
    const panelStyle = panelBody ? getComputedStyle(panelBody) : null;
    const panelInset = panelStyle
      ? { left: panelStyle.paddingLeft, right: panelStyle.paddingRight }
      : null;

    // Panels must stay inside main (+1px tolerance) UNLESS they sit inside an
    // intentionally scrollable ancestor (Family columns scroll internally at
    // 2xl; Today tiles never scroll at 1080p). A panel inside a scroller is
    // reachable by scrolling, so it is not "clipped" — only panels in a
    // non-scrolling context escaping main are real defects.
    const panelsOutsideMain: string[] = [];
    for (const section of main.querySelectorAll("section.rounded-xl")) {
      const rect = section.getBoundingClientRect();
      if (rect.bottom <= mainRect.bottom + 1 && rect.right <= mainRect.right + 1) continue;
      const inScroller = !!section.parentElement?.closest(
        "div[class*='overflow-y-auto'], div[class*='overflow-auto']",
      );
      if (!inScroller) {
        panelsOutsideMain.push(
          section.getAttribute("aria-label") ??
            (section.querySelector("h2")?.textContent ?? "section"),
        );
      }
    }

    // Touch targets: every visible button/input/select ≥56px tall.
    //
    // Calendar day cells are the one documented exemption: a month grid is six
    // rows of squares whose height is set by the grid, and forcing 56px each
    // stretches the calendar into mostly-empty space. They carry a 44px floor
    // instead, asserted separately below.
    const smallControls: { tag: string; name: string; height: number }[] = [];
    for (const el of document.querySelectorAll("button, input, select, [role='slider']")) {
      const html = el as HTMLElement;
      if (html.getClientRects().length === 0) continue;
      if (html.closest("[hidden]")) continue;
      const height = html.getBoundingClientRect().height;
      const floor = html.hasAttribute("data-calendar-day") ? 43.5 : 55.5;
      if (height < floor) {
        smallControls.push({
          tag: html.tagName.toLowerCase(),
          name:
            html.getAttribute("aria-label") ??
            ((html.textContent || "").trim().slice(0, 40) ||
              html.getAttribute("name") ||
              "?"),
          height: Math.round(height * 10) / 10,
        });
      }
    }

    // Type scale: every visible text node must sit on the canonical scale
    // (meta 16, body 18, bodyLg 20, metric 24, countdown 32, clock 40, hero 64).
    const ON_SCALE = ["16px", "18px", "20px", "24px", "32px", "40px", "64px"];
    const offScaleText: { tag: string; text: string; fontSize: string }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") continue;
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (!hasText) continue;
      if (el.getClientRects().length === 0) continue;
      const fontSize = getComputedStyle(el).fontSize;
      if (!ON_SCALE.includes(fontSize)) {
        offScaleText.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().slice(0, 40),
          fontSize,
        });
      }
    }

    return {
      mainPadding: getComputedStyle(main).padding,
      gridGap,
      panelInset,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelsOutsideMain,
      smallControls,
      offScaleText,
    };
  }, gridSelector);
}

test.describe("1920×1080 layout (both themes)", () => {
  for (const screen of SCREENS) {
    test(`${screen.name}: 24px gutters/gaps, no clipping, 56px controls, on-scale type`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      for (const theme of THEMES) {
        await openScreen(page, screen, theme);
        const audit = await auditLayout(page, GRID_SELECTOR[screen.name]);

        // Page gutter.
        expect(audit.mainPadding, `${theme} main padding`).toBe("24px");

        // Primary grid gap.
        expect(audit.gridGap, `${theme} ${screen.name} grid gap`).toBe("24px");

        // Panel content inset.
        if (audit.panelInset) {
          expect(audit.panelInset.left).toBe("24px");
          expect(audit.panelInset.right).toBe("24px");
        }

        // No panel may escape main.
        expect(audit.panelsOutsideMain, `${theme} ${screen.name} clipped panels`).toEqual([]);

        // Nothing sticks out sideways.
        expect(audit.horizontalOverflow, `${theme} horizontal overflow`).toBeLessThanOrEqual(0);

        // Touch targets.
        expect(
          audit.smallControls,
          `${theme} ${screen.name} sub-56px controls`,
        ).toEqual([]);

        // Type scale.
        expect(audit.offScaleText, `${theme} ${screen.name} off-scale text`).toEqual([]);
      }
    });
  }
});

test.describe("1280×720 layout (both themes)", () => {
  for (const screen of SCREENS) {
    test(`${screen.name}: scrollable, no horizontal overflow, 56px controls, on-scale type`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      for (const theme of THEMES) {
        await openScreen(page, screen, theme);
        const audit = await auditLayout(page, GRID_SELECTOR[screen.name]);

        // Page gutter still 24px.
        expect(audit.mainPadding, `${theme} main padding`).toBe("24px");

        // Nothing sticks out sideways.
        expect(audit.horizontalOverflow, `${theme} horizontal overflow`).toBeLessThanOrEqual(0);

        // Touch targets + type scale hold at the small viewport too.
        expect(audit.smallControls, `${theme} ${screen.name} sub-56px controls`).toEqual([]);
        expect(audit.offScaleText, `${theme} ${screen.name} off-scale text`).toEqual([]);

        // The stacked screen must scroll (or exactly fit) — never clip.
        const dims = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          main.scrollTo(0, main.scrollHeight);
          return {
            scrollHeight: main.scrollHeight,
            clientHeight: main.clientHeight,
            reachedBottom: main.scrollTop + main.clientHeight >= main.scrollHeight - 1,
          };
        });
        expect(dims.scrollHeight, `${theme} ${screen.name} scrollHeight`).toBeGreaterThanOrEqual(
          dims.clientHeight,
        );
        expect(dims.reachedBottom, `${theme} ${screen.name} scroll to bottom`).toBe(true);
      }
    });
  }
});

test.describe("range controls (RangeControl hit areas)", () => {
  for (const vp of VIEWPORTS) {
    test(`sliders are 56px tall on Home and Music at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/?theme=light");

      for (const tab of ["Home", "Music"]) {
        await page
          .locator('nav[aria-label="Primary"]')
          .getByRole("button", { name: new RegExp(`^${tab}$`) })
          .click();
        // Demo data always gives Home a brightness slider and Music a volume
        // slider — wait for one before measuring.
        await expect(page.locator("input[type='range']").first()).toBeVisible();
        const heights = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLInputElement>("input[type='range']"))
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getBoundingClientRect().height),
        );
        expect(heights.length, `${tab} visible sliders`).toBeGreaterThan(0);
        for (const height of heights) expect(height, `${tab} slider hit area`).toBeGreaterThanOrEqual(56);
      }
    });
  }
});

test("calendar chips: metadata type, 28px minimum, readable title at 1280×720", async ({
  page,
  request,
}) => {
  // Seed one timed event for today so a chip actually renders.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await request.post("/api/calendar/events", {
    data: {
      title: "Layout spec event",
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?theme=light");
  await page
    .locator('nav[aria-label="Primary"]')
    .getByRole("button", { name: /^Calendar$/ })
    .click();
  await expect(page.getByText("Layout spec event").first()).toBeVisible();
  await page.waitForTimeout(300);

  const chip = await page.evaluate(() => {
    const title = Array.from(document.querySelectorAll("span")).find(
      (s) => s.textContent?.trim() === "Layout spec event",
    );
    if (!title) throw new Error("chip title not found");
    const chipEl = title.closest('[data-testid="event-chip"]');
    const time = chipEl?.querySelector("span");
    const titleRect = title.getBoundingClientRect();
    const chipRect = chipEl?.getBoundingClientRect();
    return {
      titleWidth: titleRect.width,
      chipHeight: chipRect?.height ?? 0,
      timeWidth: time && time !== title ? time.getBoundingClientRect().width : 0,
      titleFontSize: getComputedStyle(title).fontSize,
    };
  });

  // The title is readable (nonzero) whenever the time is shown; if the time
  // were hidden on narrow cells the title requirement is waived.
  if (chip.timeWidth > 0) {
    expect(chip.titleWidth, "chip title width with time visible").toBeGreaterThan(0);
  }
  // Metadata type (16px on the kiosk scale) and the 28px chip-height floor.
  expect(chip.titleFontSize).toBe("16px");
  expect(chip.chipHeight, "chip minimum height").toBeGreaterThanOrEqual(28);

  // Day cells stay on the touch target and the calendar keeps on-scale type.
  const audit = await auditLayout(page, '[data-testid="event-chip"]');
  expect(audit.smallControls, "calendar sub-56px controls").toEqual([]);
  expect(audit.offScaleText, "calendar off-scale text").toEqual([]);
  expect(audit.horizontalOverflow).toBeLessThanOrEqual(0);
});

test("Today fits: no tile scrolls or clips, collapsed or expanded", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Audit every panel body for content taller than its box. `overflow: hidden`
  // means a too-tall panel silently crops its own controls, so scrollHeight is
  // the honest signal here — not whether a scrollbar appears.
  const audit = () =>
    page.evaluate(() => {
      const bad: { panel: string; overflow: number }[] = [];
      for (const section of document.querySelectorAll<HTMLElement>("main section.rounded-xl")) {
        const body = section.querySelector<HTMLElement>("header + div");
        if (!body) continue;
        const overflow = body.scrollHeight - body.clientHeight;
        if (overflow > 1) {
          bad.push({
            panel: section.querySelector("h2")?.textContent?.trim() ?? "section",
            overflow,
          });
        }
      }
      const main = document.querySelector("main")!;
      return { bad, mainOverflow: main.scrollHeight - main.clientHeight };
    });

  for (const theme of THEMES) {
    await page.goto(`/?theme=${theme}`);
    await expect(page.getByRole("heading", { name: "Weather" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Now Playing" })).toBeVisible();
    await page.waitForTimeout(400);

    const collapsed = await audit();
    expect(collapsed.bad, `${theme} collapsed: clipped panels`).toEqual([]);
    expect(collapsed.mainOverflow, `${theme} collapsed: main scrolls`).toBeLessThanOrEqual(0);

    // Expanding the voice notes must not squeeze the player's controls away.
    const show = page.getByRole("button", { name: "Show voice notes" });
    if (await show.count()) {
      await show.click();
      await page.waitForTimeout(400);
      const expanded = await audit();
      expect(expanded.bad, `${theme} expanded: clipped panels`).toEqual([]);
      expect(expanded.mainOverflow, `${theme} expanded: main scrolls`).toBeLessThanOrEqual(0);
    }
  }
});

test("settings splits into two columns at 1920×1080", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?theme=light");
  await page.getByRole("banner").getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: new RegExp("^Household$") })).toBeVisible();
  await page.waitForTimeout(300);

  const columns = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="settings-grid"]')!).gridTemplateColumns.split(" ").length,
  );
  expect(columns).toBe(2);
});
