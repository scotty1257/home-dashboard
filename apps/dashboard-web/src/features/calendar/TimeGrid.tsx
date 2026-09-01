import { useEffect, useMemo, useRef } from "react";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { colorOf, inkColorOf, softColor } from "../../lib/colors";
import { cn } from "../../lib/cn";
import {
  allDayOn,
  dateKey,
  layoutDay,
  minutesInto,
  sameDay,
  timedOn,
} from "./calendarUtils";
import { EventChip, isNow, timeShort } from "./EventChip";

/** Pixels per hour. 56 keeps a 30-minute event on the 28px chip floor. */
const HOUR_PX = 56;
const DAY_PX = HOUR_PX * 24;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** "2 PM" / "12 AM" — the gutter labels. */
function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

interface Props {
  days: Date[];
  events: CalendarEvent[];
  now: Date;
  onOpen: (event: CalendarEvent) => void;
  /** Create at a clicked slot; the date carries the rounded start time. */
  onCreate: (date: Date) => void;
  /** Column headings — omitted on the single-day view, which has its own. */
  showDayHeadings?: boolean;
}

/**
 * The shared time grid behind the Week and Day views.
 *
 * Timed events are absolutely positioned by minute offset over a 24-hour
 * column, so an event's height *is* its duration — the thing a month grid
 * cannot show. All-day and full-span events are lifted into a band above the
 * scroller so they don't stretch a 24-hour-tall box.
 *
 * The scroller opens near the working day rather than at midnight, since eight
 * hours of empty night is the first thing you'd otherwise see.
 */
export function TimeGrid({
  days,
  events,
  now,
  onOpen,
  onCreate,
  showDayHeadings = true,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string>("");

  const columns = useMemo(
    () =>
      days.map((day) => ({
        day,
        key: dateKey(day),
        allDay: allDayOn(events, day),
        laid: layoutDay(timedOn(events, day), day),
      })),
    [days, events],
  );

  const allDayRows = Math.max(...columns.map((c) => c.allDay.length), 0);

  // Scroll to the current hour (or 8 AM on other weeks) once per range, not on
  // every minute tick — re-scrolling under the user would fight their reading.
  const rangeKey = columns.map((c) => c.key).join();
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scrolledFor.current === rangeKey) return;
    scrolledFor.current = rangeKey;
    // Open on the current hour, but never scroll so far that the day's events
    // sit above the fold — at 10 PM, "now minus one hour" would show an empty
    // late evening and hide everything that actually happened today. Clamping
    // to the last full screen keeps the tail of the day visible either way.
    const focusHour = days.some((d) => sameDay(d, now)) ? Math.max(0, now.getHours() - 1) : 8;
    const maxScroll = Math.max(0, DAY_PX - scroller.clientHeight);
    scroller.scrollTop = Math.min(focusHour * HOUR_PX, maxScroll);
  }, [rangeKey, days, now]);

  const nowDay = days.find((d) => sameDay(d, now));
  const nowOffset = nowDay ? minutesInto(now, nowDay) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line">
      {/* Sticky heading row: weekday + date, aligned to the columns below. */}
      {showDayHeadings && (
        <div
          className="grid shrink-0 border-b border-line bg-surface/60"
          style={{ gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <span aria-hidden />
          {days.map((day) => {
            const today = sameDay(day, now);
            return (
              <div
                key={dateKey(day)}
                className="flex items-center justify-center gap-2 border-l border-line py-2"
              >
                <span
                  className={cn(
                    "text-meta font-semibold uppercase tracking-wide",
                    today ? "text-accent-ink" : "text-ink-3",
                  )}
                >
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span
                  className={cn(
                    "flex h-8 min-w-8 items-center justify-center rounded-pill px-2 text-body font-semibold tabular-nums",
                    today ? "bg-accent text-white" : "text-ink-2",
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* All-day band. Only rendered when something occupies it, so a week with
          no all-day events doesn't pay a permanent strip of empty height. */}
      {allDayRows > 0 && (
        <div
          className="grid shrink-0 border-b border-line bg-surface/40"
          style={{ gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <span className="flex items-center justify-end pr-2 text-meta font-medium text-ink-4">
            All day
          </span>
          {columns.map(({ key, allDay }) => (
            <div key={key} className="flex flex-col gap-1 border-l border-line p-1">
              {allDay.map((event) => (
                <EventChip key={event.id} event={event} onOpen={onOpen} hideTime />
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))`,
            height: DAY_PX,
          }}
        >
          {/* Hour gutter. */}
          <div className="relative">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-meta tabular-nums text-ink-4"
                style={{ top: hour * HOUR_PX }}
              >
                {hour === 0 ? "" : hourLabel(hour)}
              </span>
            ))}
          </div>

          {columns.map(({ day, key, laid }) => (
            <div key={key} className="relative border-l border-line">
              {/* Hour rules, and a half-hour rule at lower contrast. */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-line"
                  style={{ top: hour * HOUR_PX }}
                />
              ))}
              {HOURS.map((hour) => (
                <div
                  key={`half-${hour}`}
                  className="absolute inset-x-0 border-t border-line/40"
                  style={{ top: hour * HOUR_PX + HOUR_PX / 2 }}
                />
              ))}

              {/* One click target per hour, creating at that hour. Kept behind
                  the events so a click on a pill opens it instead. */}
              {HOURS.map((hour) => (
                <button
                  key={`slot-${hour}`}
                  type="button"
                  data-calendar-slot
                  aria-label={`Add an event at ${hourLabel(hour)} on ${day.toLocaleDateString()}`}
                  onClick={() => {
                    const at = new Date(day);
                    at.setHours(hour, 0, 0, 0);
                    onCreate(at);
                  }}
                  className={cn(
                    "absolute inset-x-0 transition-colors hover:bg-accent-soft",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
                  )}
                  style={{ top: hour * HOUR_PX, height: HOUR_PX }}
                />
              ))}

              {/* The "now" line lives inside its own day's column, so its
                  width is the column's width with no offset arithmetic. */}
              {nowOffset !== null && sameDay(day, now) && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-panel flex items-center"
                  style={{ top: (nowOffset / 60) * HOUR_PX }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-pill bg-danger shadow-[0_0_8px_var(--danger)]" />
                  <span className="h-px flex-1 bg-danger" />
                </div>
              )}

              {laid.map(({ event, top, bottom, column, columns: cols }) => {
                const color = colorOf(event.color);
                const ink = inkColorOf(event.color);
                const live = isNow(event, now);
                const height = ((bottom - top) / 60) * HOUR_PX;
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-testid="event-chip"
                    data-calendar-slot
                    onClick={() => onOpen(event)}
                    title={`${event.title} — ${timeShort(event.start)}`}
                    className={cn(
                      "absolute flex flex-col items-start gap-0.5 overflow-hidden rounded-inner",
                      "px-2 py-1 text-left transition-[transform,filter] duration-[var(--dur-fast)]",
                      "hover:brightness-105 motion-safe:hover:-translate-y-px",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                      live && "chip-live",
                    )}
                    style={{
                      top: (top / 60) * HOUR_PX,
                      height,
                      // 2% right inset leaves the column's own edge visible.
                      left: `calc(${(column / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 6px)`,
                      backgroundColor: softColor(event.color, live ? 0.32 : 0.2),
                      color: ink,
                      boxShadow: `inset 3px 0 0 ${color}`,
                    }}
                  >
                    <span className="w-full truncate text-meta font-semibold leading-tight">
                      {event.title}
                    </span>
                    {/* Below ~40px there is only room for the title. */}
                    {height >= 44 && (
                      <span className="w-full truncate text-meta tabular-nums opacity-75">
                        {timeShort(event.start)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
