/**
 * Semantic color tokens (calendar events, devices).
 *
 * Re-exported from @home-dashboard/design-tokens rather than redefined here.
 * This file used to carry its own copy of the palette, which is how the package
 * drifted to different amber, lime, and teal values without anything failing.
 */
import { colors, colorList, type ColorToken } from "@home-dashboard/design-tokens/ts";

export { colors, colorList };
export type { ColorToken };

export function colorOf(token?: string | null): string {
  if (token && token in colors) return colors[token as ColorToken];
  return colors.slate;
}

/** Returns a `bg-<token>/15`-style soft value as an rgba string for inline use. */
export function softColor(token?: string | null, alpha = 0.14): string {
  const hex = colorOf(token);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The readable TEXT colour for a palette token, as a CSS var reference.
 *
 * `colorOf` returns the bright fill, which is what a chip's background and its
 * left edge use. As a label on that same tint the bright measured ~1.8:1, so
 * text reads from `--chip-ink-*` instead. It has to be a var rather than a hex
 * because the value flips with the theme: light darkens each hue, dark keeps
 * the bright, and inline styles cannot express that on their own.
 */
export function inkColorOf(token?: string | null): string {
  const name = token && token in colors ? token : "slate";
  return `var(--chip-ink-${name})`;
}
