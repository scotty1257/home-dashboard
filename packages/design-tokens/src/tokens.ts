/** Design tokens mirrored to TypeScript for runtime access (charts, canvas, etc.). */
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

export const touch = {
  min: 48,
  sm: 44,
  lg: 64,
} as const;
