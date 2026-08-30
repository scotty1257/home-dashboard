import { expect, test, type Page } from "@playwright/test";

/**
 * Visual-system layout contract (Task 18): the 8px grid.
 *
 * - page gutter 24px (`main` padding), panel gap 24px (primary grids),
 *   panel content inset 24px (first Panel body).
 * - no panel may escape main's box at 1920×1080 (no clipping).
 * - no horizontal overflow at either viewport.
 * - every visible button/input/select is at least 48px tall.
 * - no computed 11px/13px font on any visible text node.
 * - RangeControl hit areas are 48px tall.
 * - calendar chips: 12px type, ≥24px chip, readable title at 1280.
 *
 * Themes are forced deterministically with the `?theme=` URL param (see
 * lib/theme.ts) — the app otherwise follows the clock.
 */

const SCREENS = [
  { name: "today", tab: "Today" },
  { name: "family", tab: "Family" },
  { name: "launch", tab: "Launch" },
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
  launch: '[data-testid="launch-root"]',
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
      await expect(page.getByRole("group", { name: "Summary window" })).toBeVisible();
      break;
    case "family":
      for (const heading of ["Handoffs", "Permissions", "Duties"]) {
        await expect(page.getByRole("heading", { name: new RegExp(`^${heading}$`) })).toBeVisible();
      }
      break;
    case "launch":
      // Fresh DB → either the quiet state or a live run with step cards.
      await expect(page.locator("main button").first()).toBeVisible();
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

    // Panels must stay inside main (+1px tolerance for subpixel rounding).
    const panelsOutsideMain: string[] = [];
    for (const section of main.querySelectorAll("section")) {
      const rect = section.getBoundingClientRect();
      if (rect.bottom > mainRect.bottom + 1 || rect.right > mainRect.right + 1) {
        panelsOutsideMain.push(
          section.getAttribute("aria-label") ??
            (section.querySelector("h2")?.textContent ?? "section"),
        );
      }
    }

    // Touch targets: every visible button/input/select ≥48px tall.
    const smallControls: { tag: string; name: string; height: number }[] = [];
    for (const el of document.querySelectorAll("button, input, select, [role='slider']")) {
      const html = el as HTMLElement;
      if (html.getClientRects().length === 0) continue;
      if (html.closest("[hidden]")) continue;
      const height = html.getBoundingClientRect().height;
      if (height < 47.5) {
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

    // Type scale: no 11px/13px on any visible text node.
    const offScaleText: { tag: string; text: string; fontSize: string }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") continue;
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (!hasText) continue;
      if (el.getClientRects().length === 0) continue;
      const fontSize = getComputedStyle(el).fontSize;
      if (fontSize === "11px" || fontSize === "13px") {
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
    test(`${screen.name}: 24px gutters/gaps, no clipping, 48px controls, on-scale type`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      for (const theme of THEMES) {
        await openScreen(page, screen, theme);
        const audit = await auditLayout(page, GRID_SELECTOR[screen.name]);

        // Page gutter.
        expect(audit.mainPadding, `${theme} main padding`).toBe("24px");

        // Primary grid gap (launch renders its root only when a run exists).
        if (screen.name === "launch") {
          if (audit.gridGap !== null) expect(audit.gridGap).toBe("24px");
        } else {
          expect(audit.gridGap, `${theme} ${screen.name} grid gap`).toBe("24px");
        }

        // Panel content inset (launch has no panels in the quiet state).
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
          `${theme} ${screen.name} sub-48px controls`,
        ).toEqual([]);

        // Type scale.
        expect(audit.offScaleText, `${theme} ${screen.name} off-scale text`).toEqual([]);
      }
    });
  }
});

test.describe("1280×720 layout (both themes)", () => {
  for (const screen of SCREENS) {
    test(`${screen.name}: scrollable, no horizontal overflow, 48px controls, on-scale type`, async ({
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
        expect(audit.smallControls, `${theme} ${screen.name} sub-48px controls`).toEqual([]);
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
    test(`sliders are 48px tall on Home and Music at ${vp.name}`, async ({ page }) => {
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
        for (const height of heights) expect(height, `${tab} slider hit area`).toBeGreaterThanOrEqual(48);
      }
    });
  }
});

test("calendar chips: 12px type, 24px minimum, readable title at 1280×720", async ({
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
  // 12px metadata type and the 24px chip-height floor.
  expect(chip.titleFontSize).toBe("12px");
  expect(chip.chipHeight, "chip minimum height").toBeGreaterThanOrEqual(24);

  // Day cells stay 48px+ touch targets and the calendar keeps on-scale type.
  const audit = await auditLayout(page, '[data-testid="event-chip"]');
  expect(audit.smallControls, "calendar sub-48px controls").toEqual([]);
  expect(audit.offScaleText, "calendar off-scale text").toEqual([]);
  expect(audit.horizontalOverflow).toBeLessThanOrEqual(0);
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
