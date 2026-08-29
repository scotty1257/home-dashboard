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
