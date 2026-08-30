import { describe, it, expect } from "vitest";
import { forcedThemeFromSearch, isDarkAtHour, themeForNow } from "./theme";

describe("time-of-day theme", () => {
  it("is light from 06:00 and dark from 19:00", () => {
    expect(isDarkAtHour(6)).toBe(false);
    expect(isDarkAtHour(12)).toBe(false);
    expect(isDarkAtHour(18)).toBe(false);
    expect(isDarkAtHour(19)).toBe(true);
    expect(isDarkAtHour(23)).toBe(true);
    expect(isDarkAtHour(0)).toBe(true);
  });

  it("maps the hour to a theme name", () => {
    expect(themeForNow(new Date("2026-08-29T12:00:00"))).toBe("light");
    expect(themeForNow(new Date("2026-08-29T21:00:00"))).toBe("dark");
  });

  describe("forcedThemeFromSearch (e2e determinism via ?theme=)", () => {
    it("forces dark when ?theme=dark", () => {
      expect(forcedThemeFromSearch("?theme=dark")).toBe("dark");
    });

    it("forces light when ?theme=light", () => {
      expect(forcedThemeFromSearch("?theme=light")).toBe("light");
    });

    it("ignores other query params", () => {
      expect(forcedThemeFromSearch("?foo=1&theme=dark&bar=2")).toBe("dark");
    });

    it("returns null for a missing or bogus value", () => {
      expect(forcedThemeFromSearch("")).toBeNull();
      expect(forcedThemeFromSearch("?theme=blue")).toBeNull();
      expect(forcedThemeFromSearch("?other=dark")).toBeNull();
    });
  });
});
