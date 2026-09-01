import type { CalendarEvent } from "@home-dashboard/contracts";
import { colorOf } from "../../lib/colors";

export interface DayCell {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  key: string;
}

/** Build a 6x7 grid of day cells for the given month. */
export function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);
  const today = new Date();
  const todayKey = dateKey(today);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      isToday: dateKey(date) === todayKey,
      key: dateKey(date),
    });
  }
  return cells;
}

/** YYYY-MM-DD in local time. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Events on a given local day. */
export function eventsOnDay(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const key = dateKey(date);
  return events
    .filter((e) => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      const startKey = dateKey(start);
      const endKey = dateKey(end);
      return startKey <= key && key <= endKey;
    })
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });
}

export function eventColor(e: CalendarEvent): string {
  return colorOf(e.color);
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEKDAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Midnight local on `base` shifted by `days`. */
export function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** The Sunday on or before `date`, at midnight local. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

/** Seven midnight-local dates beginning at the Sunday of `date`'s week. */
export function weekDays(date: Date): Date[] {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** True when the two dates fall on the same local day. */
export function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

/** Minutes from local midnight, clamped into the day. */
export function minutesInto(date: Date, day: Date): number {
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return Math.min(1440, Math.max(0, (date.getTime() - midnight) / 60000));
}

/**
 * An event's vertical extent on `day`, in minutes from midnight. Multi-day
 * events are clipped to the day, so a span that started yesterday begins at 0.
 */
export function daySpan(event: CalendarEvent, day: Date): { top: number; bottom: number } {
  const top = minutesInto(new Date(event.start), day);
  const bottom = minutesInto(new Date(event.end), day);
  // A zero-length or inverted event still needs a visible box.
  return { top, bottom: Math.max(bottom, top + MIN_EVENT_MINUTES) };
}

/** Shortest box a time-grid event may occupy, so a 5-minute event stays tappable. */
export const MIN_EVENT_MINUTES = 30;

export interface LaidOutEvent {
  event: CalendarEvent;
  top: number;
  bottom: number;
  /** Horizontal slot index within its overlap cluster. */
  column: number;
  /** How many columns the cluster was split into. */
  columns: number;
}

/**
 * Position overlapping timed events side by side.
 *
 * Events are swept in start order and grouped into clusters of mutually
 * overlapping boxes; within a cluster each event takes the first column whose
 * last event has already ended. Every event in a cluster is then widened to the
 * same column count, so a 3-deep morning doesn't leave two events full width
 * and the third squeezed.
 */
export function layoutDay(events: CalendarEvent[], day: Date): LaidOutEvent[] {
  const timed = events
    .filter((e) => !e.allDay)
    .map((event) => ({ event, ...daySpan(event, day) }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const out: LaidOutEvent[] = [];
  let cluster: LaidOutEvent[] = [];
  let columnEnds: number[] = [];

  const flush = () => {
    const columns = columnEnds.length;
    for (const item of cluster) item.columns = columns;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const item of timed) {
    // A gap from every open column closes the cluster.
    if (cluster.length > 0 && columnEnds.every((end) => end <= item.top)) flush();

    let column = columnEnds.findIndex((end) => end <= item.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.bottom);
    } else {
      columnEnds[column] = item.bottom;
    }
    cluster.push({ ...item, column, columns: 1 });
  }
  flush();
  return out;
}

/** All-day (or multi-day) events on `day`, which sit above the time grid. */
export function allDayOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return eventsOnDay(events, day).filter((e) => e.allDay || spansWholeDay(e, day));
}

/** True when the event covers `day` end to end — a multi-day span's middle. */
export function spansWholeDay(event: CalendarEvent, day: Date): boolean {
  const { top, bottom } = daySpan(event, day);
  return top === 0 && bottom >= 1440;
}

/** Timed events on `day`, excluding the all-day band's occupants. */
export function timedOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return eventsOnDay(events, day).filter((e) => !e.allDay && !spansWholeDay(e, day));
}
