import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { WeatherCondition } from "@home-dashboard/contracts";
import { WeatherScene } from "./WeatherScene";

/** Every animation the scene can draw, by the keyframe name in its class. */
function animationsFor(condition: WeatherCondition, isDay = true): string[] {
  const { container } = render(<WeatherScene condition={condition} isDay={isDay} />);
  const names = new Set<string>();
  for (const el of container.querySelectorAll("*")) {
    for (const cls of (el.getAttribute("class") ?? "").split(/\s+/)) {
      const match = /^animate-\[([a-zA-Z]+)/.exec(cls);
      if (match) names.add(match[1]!);
    }
  }
  return [...names];
}

describe("WeatherScene", () => {
  it("is decorative only — never announced to assistive tech", () => {
    const { container } = render(<WeatherScene condition="rain" isDay />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
  });

  it("falls rain for rain and drizzle, and snow for snow", () => {
    expect(animationsFor("rain")).toContain("rainFall");
    expect(animationsFor("drizzle")).toContain("rainFall");
    expect(animationsFor("snow")).toContain("snowFall");
    expect(animationsFor("snow")).not.toContain("rainFall");
  });

  it("mixes rain and snow for sleet", () => {
    const animations = animationsFor("sleet");
    expect(animations).toContain("rainFall");
    expect(animations).toContain("snowFall");
  });

  it("adds lightning on top of rain for a thunderstorm", () => {
    const animations = animationsFor("thunderstorm");
    expect(animations).toContain("rainFall");
    expect(animations).toContain("lightningFlash");
  });

  it("drifts clouds when cloudy, fog bands when foggy, gusts when windy", () => {
    expect(animationsFor("cloudy")).toContain("cloudDrift");
    expect(animationsFor("fog")).toContain("fogDrift");
    expect(animationsFor("windy")).toContain("windGust");
  });

  it("twinkles stars on a clear night but not a clear day", () => {
    expect(animationsFor("clear", false)).toContain("twinkle");
    expect(animationsFor("clear", true)).not.toContain("twinkle");
  });

  it("glows a sun or moon whenever the sky is visible", () => {
    expect(animationsFor("clear", true)).toContain("weatherGlow");
    expect(animationsFor("clear", false)).toContain("weatherGlow");
    expect(animationsFor("partly-cloudy")).toContain("weatherGlow");
    // Fully overcast: no disc to show.
    expect(animationsFor("cloudy")).not.toContain("weatherGlow");
  });
});
