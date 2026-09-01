import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { colors, space, radii, touch, typeScale } from "@home-dashboard/design-tokens/ts";

describe("canonical design tokens (non-color primitives)", () => {
  it("exposes the 8px spacing scale (s1..s8 = 8..64)", () => {
    expect(space.s1).toBe(8);
    expect(space.s2).toBe(16);
    expect(space.s3).toBe(24);
    expect(space.s4).toBe(32);
    expect(space.s5).toBe(40);
    expect(space.s6).toBe(48);
    expect(space.s7).toBe(56);
    expect(space.s8).toBe(64);
  });

  it("exposes exactly one 4px micro step for micro-layout only", () => {
    expect(space.micro).toBe(4);
  });

  it("exposes the canonical radius scale", () => {
    expect(radii.inner).toBe(6);
    expect(radii.control).toBe(8);
    expect(radii.panel).toBe(12);
    expect(radii.pill).toBe(9999);
  });

  it("exposes the canonical touch targets", () => {
    expect(touch.target).toBe(56);
    expect(touch.lg).toBe(72);
  });

  it("exposes the canonical type scale with a 16px kiosk floor", () => {
    expect(typeScale.meta).toBe(16);
    expect(typeScale.body).toBe(18);
    expect(typeScale.bodyLg).toBe(20);
    expect(typeScale.title).toBe(22);
    expect(typeScale.metric).toBe(24);
    expect(typeScale.heading).toBe(28);
    expect(typeScale.countdown).toBe(32);
    expect(typeScale.clock).toBe(40);
    expect(typeScale.display).toBe(48);
    expect(typeScale.hero).toBe(64);
  });

  it("keeps every step on the scale at or above the 16px floor", () => {
    for (const [name, size] of Object.entries(typeScale)) {
      expect(size, `${name} is below the kiosk floor`).toBeGreaterThanOrEqual(16);
    }
  });

  /**
   * The palette is defined twice by necessity: once in TypeScript for runtime
   * use, once as Tailwind `--color-*` entries so utilities like `text-amber`
   * exist. They drifted apart on amber, lime, and teal without anything
   * failing, so pin them together.
   */
  it("keeps the TS palette and the CSS --color-* tokens in step", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");
    for (const [name, hex] of Object.entries(colors)) {
      const match = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
      expect(match, `--color-${name} missing from app.css`).not.toBeNull();
      expect(match?.[1]?.trim().toLowerCase(), `--color-${name}`).toBe(hex.toLowerCase());
    }
  });
});
