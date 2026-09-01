import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ArrowLeftRight } from "lucide-react";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { dateKey, eventsOnDay } from "./calendarUtils";
import { EventEditorSheet } from "./EventEditorSheet";

/** How many days the agenda covers, today included. */
const DAYS = 7;

/** Midnight local on `base` plus `offset` days. */
function dayAt(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
}

/**
 * Day heading. The first two days are named rather than dated — "Today" reads
 * faster than "Sunday" when you are walking past the screen.
 */
function dayLabel(date: Date, offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The week ahead as a vertical list, starting with today — the Today-screen
 * calendar tile.
 *
 * A month grid on this screen spent most of its cells on days that had already
 * happened or were weeks away, and squeezed the days that matter into 1/42nd of
 * the tile each. Seven stacked rows give the near week the whole column, so an
 * event is a line of readable text rather than a 2-character chip.
 *
 * The full month grid still lives on the Calendar tab (CalendarPanel).
 */
export function WeekAgendaPanel() {
  const today = new Date();
  const [editing, setEditing] = useState<CalendarEvent | { date: Date } | null>(null);

  // Query exactly the window shown, rather than the surrounding month.
  const range = useMemo(() => {
    const start = dayAt(today, 0);
    const end = dayAt(today, DAYS - 1);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey(today)]);

  const { data } = useQuery({
    queryKey: ["calendar", range.start, range.end],
    queryFn: () => api.calendar.list(range.start, range.end),
  });
  const events = useMemo(() => data?.events ?? [], [data]);

  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, offset) => {
        const date = dayAt(today, offset);
        return { date, offset, key: dateKey(date), events: eventsOnDay(events, date) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, dateKey(today)],
  );

  return (
    <Panel
      className="flex h-full flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      icon={CalendarDays}
      accent="accent"
      title="This week"
    >
      {/* The scroller is this inner list, not the panel body: the layout audit
          measures the body's own scrollHeight, and a tile that scrolls itself
          is still a tile whose content does not fit. Seven days rarely fit a
          half-height cell, so the list scrolls within a fixed frame. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
      {days.map(({ date, offset, key, events: dayEvents }) => (
        <div key={key} className="flex min-h-0 shrink-0 flex-col">
          <div className="flex items-baseline gap-2 pb-1 pt-2 first:pt-0">
            <span
              className={cn(
                "text-body font-semibold",
                offset === 0 ? "text-accent-ink" : "text-ink-2",
              )}
            >
              {dayLabel(date, offset)}
            </span>
            <span className="text-meta tabular-nums text-ink-4">
              {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          {dayEvents.length === 0 ? (
            <button
              type="button"
              onClick={() => setEditing({ date })}
              aria-label={`Add an event on ${date.toLocaleDateString()}`}
              className={cn(
                "flex min-h-touch items-center rounded-inner px-2 text-left text-meta text-ink-4",
                "transition-colors hover:bg-surface hover:text-ink-3",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
              )}
            >
              Nothing scheduled
            </button>
          ) : (
            <ul className="flex flex-col gap-1">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    data-testid="event-chip"
                    onClick={() => setEditing(e)}
                    className={cn(
                      "flex min-h-touch w-full items-center gap-2.5 rounded-inner px-2 text-left",
                      "transition-colors hover:bg-surface",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
                    )}
                  >
                    {/* Event colour as an edge, matching the voice-note tile. */}
                    <span
                      aria-hidden
                      className="h-8 w-1 shrink-0 rounded-pill"
                      style={{ backgroundColor: colorOf(e.color) }}
                    />
                    <span className="w-20 shrink-0 text-meta font-medium tabular-nums text-ink-3">
                      {e.allDay ? "All day" : timeShort(e.start)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink">
                      {e.title}
                    </span>
                    {e.requiresHandoff && (
                      <ArrowLeftRight
                        aria-label="Handoff"
                        size={16}
                        className="shrink-0 text-ink-3"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      </div>

      <EventEditorSheet open={editing !== null} initial={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}
