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

export function conditionLabel(c: string): string {
  return c
    .split("-")
    .map((w) => (w[0] ?? "").toUpperCase() + w.slice(1))
    .join(" ");
}
