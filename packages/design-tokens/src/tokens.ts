/** Design tokens mirrored to TypeScript for runtime access (charts, canvas, etc.). */

/**
 * Fixed hex values for the semantic color family (calendar events, devices).
 *
 * This is the single source. These same values are mirrored into Tailwind as
 * `--color-*` in the web app's styles/app.css `@theme` block; the two must stay
 * in step. They previously disagreed on amber, lime, and teal, with the app
 * rendering one set and this module reporting another.
 */
export const colors = {
  coral: "#ff7a5c",
  amber: "#f5a623",
  lime: "#9fd356",
  teal: "#3fc6b2",
  sky: "#5db8ff",
  indigo: "#7c8cff",
  violet: "#b58cff",
  rose: "#ff7ab8",
  slate: "#8b94a6",
} as const;

export type ColorToken = keyof typeof colors;

export const colorSoft = (token: ColorToken): string =>
  `${colors[token]}29`; // ~16% alpha

export const colorList = Object.keys(colors) as ColorToken[];

/** 8px-base spacing scale (s1..s8 = 8..64px). `micro` is the ONLY 4px step
 *  and is reserved for micro-layout (status dots, two-line metadata). */
export const space = {
  micro: 4,
  s1: 8,
  s2: 16,
  s3: 24,
  s4: 32,
  s5: 40,
  s6: 48,
  s7: 56,
  s8: 64,
} as const;

/** Radii: control = buttons/inputs (rounded-lg, 8px), panel = cards
 *  (rounded-xl, 12px), pill for fully-rounded chips. `inner` (6px) is for
 *  elements nested inside a control — always smaller than their container. */
export const radii = {
  inner: 6,
  control: 8,
  panel: 12,
  pill: 9999,
} as const;

/** Touch targets: 56px minimum interactive size for a finger-driven kiosk,
 *  72px for hero/primary actions (Assistant, record). */
export const touch = {
  target: 56,
  lg: 72,
} as const;

/** Canonical type scale in px, tuned for a wall-mounted touch kiosk.
 *  16px floor: nothing on a screen read from across a room goes below it,
 *  so `meta` is 16 and secondary emphasis comes from color/weight, not size. */
export const typeScale = {
  meta: 16,
  body: 18,
  bodyLg: 20,
  metric: 24,
  countdown: 32,
  clock: 40,
  hero: 64,
} as const;
