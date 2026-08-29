import { colors, type ColorToken } from "@home-dashboard/design-tokens/ts";

export { colors };
export type { ColorToken };

/** Resolve a color token name to its hex value, defaulting to slate. */
export function colorOf(token?: string): string {
  return (token && token in colors ? colors[token as ColorToken] : colors.slate);
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function formatEventTime(iso: string, allDay = false): string {
  const d = new Date(iso);
  if (allDay) return "All day";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function temperatureLabel(value: number, units: "imperial" | "metric"): string {
  return `${Math.round(value)}°`;
}

export function conditionIcon(condition: string): string {
  const map: Record<string, string> = {
    clear: "☀️",
    "partly-cloudy": "⛅",
    cloudy: "☁️",
    fog: "🌫️",
    rain: "🌧️",
    drizzle: "🌦️",
    snow: "🌨️",
    sleet: "🌨️",
    thunderstorm: "⛈️",
    windy: "💨",
  };
  return map[condition] ?? "🌤️";
}

export function domainIcon(domain: string): string {
  const map: Record<string, string> = {
    light: "💡",
    switch: "🔌",
    climate: "🌡️",
    cover: "🪟",
    lock: "🔒",
    sensor: "📊",
    binary_sensor: "🚪",
    fan: "🌀",
    media_player: "🔊",
    scene: "🎬",
    script: "⚙️",
    button: "🔘",
    number: "🔢",
    select: "🎚️",
  };
  return map[domain] ?? "•";
}
