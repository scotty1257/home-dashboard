import { useEffect } from "react";

/**
 * Time-of-day theming. The dashboard toggles between light and dark
 * automatically: light from 06:00, dark from 19:00. No manual override — this
 * keeps the theme system minimal (the `dark` class on <html> drives Tailwind).
 */
export const LIGHT_START_HOUR = 6; // 06:00
export const DARK_START_HOUR = 19; // 19:00

export function isDarkAtHour(hour: number): boolean {
  return hour >= DARK_START_HOUR || hour < LIGHT_START_HOUR;
}

export function themeForNow(date: Date = new Date()): "light" | "dark" {
  return isDarkAtHour(date.getHours()) ? "dark" : "light";
}

/** Applies the time-of-day theme to the document and keeps it current. */
export function useTimeOfDayTheme(): void {
  useEffect(() => {
    const apply = () => {
      const theme = themeForNow();
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
      document.documentElement.setAttribute("data-theme", theme);
    };
    apply();

    // Re-check at the top of each minute (and on the next hour boundary) so the
    // theme flips exactly when the time crosses into dark/light.
    const id = setInterval(apply, 30_000);
    return () => clearInterval(id);
  }, []);
}
