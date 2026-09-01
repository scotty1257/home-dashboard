import { useMemo } from "react";
import { CalendarOff, MapPin, Repeat, ArrowLeftRight } from "lucide-react";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { addDays, dateKey, eventsOnDay, sameDay } from "./calendarUtils";
import { isNow, timeRange } from "./EventChip";

interface Props {
  /** First day of the listed span. */
  start: Date;
  /** How many days to list. */
  days: number;
  events: CalendarEvent[];
  now: Date;
  onOpen: (event: CalendarEvent) => void;
  onCreate: (date: Date) => void;
  /** Resolves an owner id to a display name for the row's trailing label. */
  members?: { id: string; displayName: string }[];
  /** Hide days with nothing on them — the default for a long span. */
  hideEmptyDays?: boolean;
}

/**
 * A flat, scannable list of what's coming — the view you read from across the
 * room. Days with nothing on them collapse away by default, so a month's
 * agenda is a dozen lines rather than thirty mostly-empty headings.
 */
export function AgendaList({
  start,
  days,
  events,
  now,
  onOpen,
  onCreate,
  members = [],
  hideEmptyDays = true,
}: Props) {
  const ownerName = (id: string) =>
    members.find((m) => m.id === id)?.displayName ?? "";
  const rows = useMemo(() => {
    const all = Array.from({ length: days }, (_, i) => {
      const date = addDays(start, i);
      return { date, key: dateKey(date), events: eventsOnDay(events, date) };
    });
    return hideEmptyDays ? all.filter((row) => row.events.length > 0) : all;
  }, [start, days, events, hideEmptyDays]);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-ink-4">
        <CalendarOff size={30} aria-hidden />
        <p className="text-body">Nothing scheduled in this range.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
      {rows.map(({ date, key, events: dayEvents }) => {
        const today = sameDay(date, now);
        return (
          <section key={key} className="flex flex-col gap-1">
            <header className="flex items-baseline gap-3 pb-1">
              <span
                className={cn(
                  "text-body font-semibold",
                  today ? "text-accent-ink" : "text-ink-2",
                )}
              >
                {today ? "Today" : date.toLocaleDateString(undefined, { weekday: "long" })}
              </span>
              <span className="text-meta tabular-nums text-ink-4">
                {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span className="h-px flex-1 bg-line" />
              <span className="text-meta tabular-nums text-ink-4">
                {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
              </span>
            </header>

            {dayEvents.length === 0 ? (
              <button
                type="button"
                onClick={() => onCreate(date)}
                aria-label={`Add an event on ${date.toLocaleDateString()}`}
                className={cn(
                  "flex min-h-touch items-center rounded-inner px-3 text-left text-meta text-ink-4",
                  "transition-colors hover:bg-surface hover:text-ink-3",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
                )}
              >
                Nothing scheduled
              </button>
            ) : (
              <ul className="flex flex-col gap-1">
                {dayEvents.map((event) => {
                  const live = isNow(event, now);
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        data-testid="event-chip"
                        onClick={() => onOpen(event)}
                        className={cn(
                          "flex min-h-touch w-full items-center gap-3 rounded-inner px-3 text-left",
                          "transition-colors hover:bg-surface",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
                          live && "bg-accent-soft",
                        )}
                      >
                        <span
                          aria-hidden
                          className="h-8 w-1 shrink-0 rounded-pill"
                          style={{ backgroundColor: colorOf(event.color) }}
                        />
                        <span className="w-44 shrink-0 text-meta font-medium tabular-nums text-ink-3">
                          {timeRange(event)}
                        </span>
                        <span className="min-w-0 shrink truncate text-body font-medium text-ink">
                          {event.title}
                        </span>
                        {live && (
                          <span className="shrink-0 rounded-pill bg-danger px-2 py-0.5 text-meta font-semibold text-white">
                            Now
                          </span>
                        )}
                        {event.location && (
                          <span className="hidden min-w-0 shrink items-center gap-1 truncate text-meta text-ink-4 xl:flex">
                            <MapPin size={18} aria-hidden className="shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </span>
                        )}
                        {/* Pushes the trailing glyphs to the row's right edge,
                            so a 1920px row reads as one line rather than a
                            cluster of text stranded on the left. */}
                        <span aria-hidden className="flex-1" />
                        {event.ownerId && (
                          <span className="hidden shrink-0 text-meta text-ink-4 lg:inline">
                            {ownerName(event.ownerId)}
                          </span>
                        )}
                        {event.recurrence?.frequency !== "none" && (
                          <Repeat aria-label="Repeats" size={18} className="shrink-0 text-ink-4" />
                        )}
                        {event.requiresHandoff && (
                          <ArrowLeftRight aria-label="Handoff" size={18} className="shrink-0 text-ink-3" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
