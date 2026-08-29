/** Fixed hex values for the semantic color tokens (calendar events, devices). */
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

export const colorList = Object.keys(colors) as ColorToken[];

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
