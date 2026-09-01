import type { CalendarEvent } from "@home-dashboard/contracts";
import { dateKey } from "./calendarUtils";

/** RFC 5545 escaping: backslash, semicolon, comma, and newline. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC stamp, e.g. 20260831T140000Z. */
function stampUtc(iso: string): string {
  return `${new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** All-day values are local dates with no time part: 20260831. */
function stampDate(iso: string): string {
  return dateKey(new Date(iso)).replace(/-/g, "");
}

/** Fold long lines at 75 octets, per RFC 5545. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

const FREQUENCIES: Record<string, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
};

const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function recurrenceLine(event: CalendarEvent): string | null {
  const rule = event.recurrence;
  if (!rule || rule.frequency === "none") return null;
  const parts = [`FREQ=${FREQUENCIES[rule.frequency]}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.frequency === "weekly" && rule.daysOfWeek?.length) {
    parts.push(`BYDAY=${rule.daysOfWeek.map((d) => ICS_DAYS[d]).join(",")}`);
  }
  if (rule.until) parts.push(`UNTIL=${stampUtc(rule.until)}`);
  return `RRULE:${parts.join(";")}`;
}

/**
 * Serialize events as an iCalendar document.
 *
 * Expanded recurrences carry a `base#occurrence` id and repeat their parent's
 * RRULE, so exporting them too would duplicate every occurrence in the
 * importing calendar. Only stored events are emitted.
 */
export function toIcs(events: CalendarEvent[], calendarName = "Home Dashboard"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Home Dashboard//Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    if (event.id.includes("#")) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@home-dashboard`);
    lines.push(`DTSTAMP:${stampUtc(event.updatedAt || event.createdAt || event.start)}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${stampDate(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${stampDate(event.end)}`);
    } else {
      lines.push(`DTSTART:${stampUtc(event.start)}`);
      lines.push(`DTEND:${stampUtc(event.end)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
    const rrule = recurrenceLine(event);
    if (rrule) lines.push(rrule);
    for (const reminder of event.reminders ?? []) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeText(event.title)}`);
      lines.push(`TRIGGER:-PT${reminder.minutesBefore}M`);
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** Hand the ICS document to the browser as a download. */
export function downloadIcs(events: CalendarEvent[], filename: string): void {
  const blob = new Blob([toIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
