import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG AA contrast, measured on real painted pixels.
 *
 * Computed styles are not enough here: panels are translucent and sit over an
 * animated gradient, so what is actually behind a label is the composite of
 * canvas + gradient + panel, not the panel's declared colour. This screenshots
 * the page with the glyphs hidden and samples the true backdrop under every
 * text box.
 *
 * This exists because an intense backdrop was once tuned by eye and pushed
 * dozens of labels under the threshold — colour changes to the gradient or the
 * ink/accent tokens must be checked against numbers, not screenshots.
 */

const THEMES = ["light", "dark"] as const;

/** AA: 4.5:1 for body text, 3:1 for large (>=24px, or >=18.66px bold). */
async function findFailures(page: Page) {
  const boxes = await page.evaluate(() => {
    const out: {
      text: string; color: number[]; size: number; bold: boolean;
      x: number; y: number; w: number; h: number;
    }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("h1,h2,h3,span,p,button,div,li,a")) {
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 1,
      );
      if (!hasText || el.getClientRects().length === 0) continue;
      const cs = getComputedStyle(el);
      const c = (cs.color.match(/[\d.]+/g) ?? []).map(Number);
      // Deliberately faded text (placeholders, disabled) is out of scope.
      if ((c[3] ?? 1) < 0.9 || parseFloat(cs.opacity) < 0.9) continue;
      // Skip labels that share their box with an SVG icon. The icon is often a
      // large light shape on a coloured fill, so quantising can make it the
      // dominant colour and report a failure for a label that is fine against
      // the fill it sits on (white on --accent measures 4.7:1). Those pairings
      // are covered by the token-level checks instead.
      if (el.querySelector("svg")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      if (r.x < 0 || r.y < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) continue;
      out.push({
        text: (el.textContent ?? "").trim().slice(0, 32),
        color: c, size: parseFloat(cs.fontSize),
        bold: parseInt(cs.fontWeight) >= 700,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    return out;
  });

  // Hide glyphs but keep every box in place, then photograph the true backdrop.
  // Computed styles cannot answer this: panels are translucent over an animated
  // gradient, so what is behind a label is a composite only the renderer knows.
  await page.addStyleTag({
    content:
      "*{color:transparent !important;text-shadow:none !important;transition:none !important}",
  });
  await page.waitForTimeout(250);
  const shot = (await page.screenshot()).toString("base64");

  return page.evaluate(
    async ({ shot, boxes }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${shot}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const scale = img.width / window.innerWidth;

      const lum = (c: number[]) => {
        const f = (x: number) => {
          x /= 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
      };

      const failures: { text: string; ratio: number; required: number }[] = [];
      for (const b of boxes) {
        // Average the label's own line box. The mean is the right statistic
        // here: a min/max picks up an icon, a 1px divider rule or a pill's
        // brighter border — pixels no glyph ever sits on — which reported
        // failures for text measuring 6:1 and better.
        const padX = Math.max(1, Math.round(b.w * 0.12));
        const padY = Math.max(1, Math.round(b.h * 0.25));
        const d = ctx.getImageData(
          Math.round((b.x + padX) * scale), Math.round((b.y + padY) * scale),
          Math.max(1, Math.round((b.w - padX * 2) * scale)),
          Math.max(1, Math.round((b.h - padY * 2) * scale)),
        ).data;
        // The MODE, not the mean. A label's box also contains whatever sits
        // beside it in the same row — a status icon, a coloured left edge, a
        // divider rule — and averaging those in reported ~2.7:1 for text that
        // is actually 7:1 against the surface it sits on. The most common
        // colour in the box IS that surface (typically >50% of the pixels).
        const counts = new Map<number, number>();
        for (let i = 0; i < d.length; i += 4) {
          // Quantise to 5 bits/channel so antialiasing does not split the peak.
          const key = ((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        if (counts.size === 0) continue;
        let bestKey = 0;
        let bestCount = -1;
        for (const [k, v] of counts) {
          if (v > bestCount) { bestCount = v; bestKey = k; }
        }
        const bg = [
          ((bestKey >> 10) & 31) * 8 + 4,
          ((bestKey >> 5) & 31) * 8 + 4,
          (bestKey & 31) * 8 + 4,
        ];
        const l1 = lum(b.color);
        const l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const required = b.size >= 24 || (b.size >= 18.66 && b.bold) ? 3 : 4.5;
        if (ratio < required) {
          failures.push({ text: b.text, ratio: Math.round(ratio * 100) / 100, required });
        }
      }
      return failures;
    },
    { shot, boxes },
  );
}

const SCREENS = ["Today", "Calendar", "Family", "Home", "Music"] as const;

/**
 * Contrast depends on what is on screen, and the suite shares one database.
 * Nothing is deleted here: other specs (layout.spec.ts) assert on events they
 * seeded, so clearing the window would break them.
 *
 * KNOWN FLAKY — do not treat a single green run as proof, and do not "fix" a
 * failure by loosening a colour token without checking the number first.
 * The audit photographs the page, then reads the modal colour inside each
 * label's box. That is only meaningful when the box is filled by the surface
 * the glyphs sit on, which is not always true here:
 *
 *   - A bare <span> label inside a TouchButton has no background of its own,
 *     so the crop samples whatever is behind the pill. White-on-accent (a real
 *     4.9:1) has reported 1.1–1.3 this way.
 *   - A row clipped by a panel that scrolls internally is still in the
 *     viewport by getBoundingClientRect, so an off-screen chip samples the
 *     backdrop rather than its own fill (a real 7.8:1 reported 3.6).
 *
 * Which elements land in those states depends on how much data earlier specs
 * seeded, so the failures move between runs. Verify a suspected violation by
 * measuring the element directly (computed colour over its own painted fill)
 * before changing any token.
 */

for (const theme of THEMES) {
  test(`${theme}: text meets WCAG AA against the real painted background`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    for (const screen of SCREENS) {
      await page.goto(`/?theme=${theme}`);
      await expect(page.getByRole("heading", { name: "Weather" })).toBeVisible();
      if (screen !== "Today") {
        await page
          .locator('nav[aria-label="Primary"]')
          .getByRole("button", { name: new RegExp(`^${screen}$`) })
          .click();
      }
      await page.waitForTimeout(700);
      // Freeze the gradient so the measured frame is the photographed frame.
      // Freeze the gradient AND every transition. `transition-colors` on the
      // view toggles means the `color:transparent` injection below animates
      // over ~150ms; screenshotting mid-fade sampled a half-faded glyph over a
      // half-faded fill and reported ratios that drifted run to run (1.12,
      // 1.26, 3.35) for text that is really 4.9:1.
      await page.addStyleTag({
        content:
          "*{animation-play-state:paused !important;transition:none !important}",
      });

      const failures = await findFailures(page);
      expect(failures, `${theme} ${screen}: text below WCAG AA`).toEqual([]);
    }
  });
}
