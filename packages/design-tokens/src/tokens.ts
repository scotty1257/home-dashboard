/** Design tokens mirrored to TypeScript for runtime access (charts, canvas, etc.). */

/** Fixed hex values for the semantic color family (calendar events, devices). */
export const colors = {
  coral: "#ff7a5c",
  amber: "#ffb454",
  lime: "#a8e05f",
  teal: "#3fd0c0",
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

/** Radii: control = buttons/inputs (rounded-md, 6px), panel = cards
 *  (rounded-lg, 8px), pill for fully-rounded chips. */
export const radii = {
  control: 6,
  panel: 8,
  pill: 9999,
} as const;

/** Touch targets: 48px minimum interactive size, 64px for hero controls. */
export const touch = {
  target: 48,
  lg: 64,
} as const;

/** Canonical type scale in px. */
export const typeScale = {
  meta: 12,
  body: 14,
  bodyLg: 16,
  metric: 20,
  countdown: 28,
  clock: 32,
  hero: 40,
} as const;
