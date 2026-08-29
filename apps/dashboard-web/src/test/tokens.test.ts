import { describe, it, expect } from "vitest";
import { space, radii, touch, typeScale } from "@home-dashboard/design-tokens/ts";

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
    expect(radii.control).toBe(6);
    expect(radii.panel).toBe(8);
    expect(radii.pill).toBe(9999);
  });

  it("exposes the canonical touch targets", () => {
    expect(touch.target).toBe(48);
    expect(touch.lg).toBe(64);
  });

  it("exposes the canonical type scale", () => {
    expect(typeScale.meta).toBe(12);
    expect(typeScale.body).toBe(14);
    expect(typeScale.bodyLg).toBe(16);
    expect(typeScale.metric).toBe(20);
    expect(typeScale.countdown).toBe(28);
    expect(typeScale.clock).toBe(32);
    expect(typeScale.hero).toBe(40);
  });
});
