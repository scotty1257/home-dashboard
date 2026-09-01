import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { cn } from "../../lib/cn";
import {
  addDays,
  dateKey,
  eventsOnDay,
  monthGrid,
  MONTH_NAMES,
  sameDay,
  startOfWeek,
  weekDays,
  WEEKDAY_NAMES,
} from "./calendarUtils";
import { applyFilter, EMPTY_FILTER, isFiltering, type CalendarFilter } from "./calendarFilters";
import { EventChip, isNow } from "./EventChip";
import { EventEditorSheet } from "./EventEditorSheet";
import { CalendarToolbar } from "./CalendarToolbar";
import { TimeGrid } from "./TimeGrid";
import { AgendaList } from "./AgendaList";
import { downloadIcs } from "./ics";
import { useNow } from "./useNow";

type Mode = "month" | "week" | "day" | "agenda";

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: "month", label: "Month", key: "M" },
  { id: "week", label: "Week", key: "W" },
  { id: "day", label: "Day", key: "D" },
  { id: "agenda", label: "Agenda", key: "A" },
];

/** How many days the agenda view lists from its anchor. */
const AGENDA_DAYS = 30;

/* Month-cell chip geometry, used to fit chips to the measured row height. */
const CHIP_PX = 28;
const CHIP_GAP_PX = 4;
const OVERFLOW_LINE_PX = 24;

/** Midnight local. */
function midnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The query window for a mode, padded so a month grid's leading and trailing
 * days (which belong to the neighbouring months) still carry their events.
 */
function rangeFor(mode: Mode, anchor: Date): { start: Date; end: Date } {
  switch (mode) {
    case "month": {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      return { start: addDays(startOfWeek(first), -1), end: addDays(startOfWeek(first), 43) };
    }
    case "week": {
      const first = startOfWeek(anchor);
      return { start: first, end: addDays(first, 7) };
    }
    case "day":
      return { start: midnight(anchor), end: addDays(anchor, 1) };
    case "agenda":
      return { start: midnight(anchor), end: addDays(anchor, AGENDA_DAYS) };
  }
}

/** The header's date label for the current mode. */
function titleFor(mode: Mode, anchor: Date): string {
  switch (mode) {
    case "month":
      return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    case "week": {
      const days = weekDays(anchor);
      const first = days[0]!;
      const last = days[6]!;
      const from = first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const to = last.toLocaleDateString(undefined, {
        month: first.getMonth() === last.getMonth() ? undefined : "short",
        day: "numeric",
      });
      return `${from} – ${to}, ${last.getFullYear()}`;
    }
    case "day":
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    case "agenda":
      return `Next ${AGENDA_DAYS} days`;
  }
}

interface Props {
  compact?: boolean;
  className?: string;
}

/**
 * The Calendar tab: month, week, day, and agenda over one shared event set.
 *
 * All four modes read the same filtered list, so narrowing to one person in
 * Month and switching to Week keeps that person's week — the filter belongs to
 * the calendar, not to a view. Navigation is a single anchor date that each
 * mode steps by its own unit (month / week / day), which is why "Today" is one
 * button rather than one per view.
 */
export function CalendarPanel({ compact = false, className }: Props) {
  const now = useNow();
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(() => midnight(new Date()));
  const [filter, setFilter] = useState<CalendarFilter>(EMPTY_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | { date: Date } | null>(null);

  const range = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);
  const { data } = useQuery({
    queryKey: ["calendar", range.start.toISOString(), range.end.toISOString()],
    queryFn: () => api.calendar.list(range.start.toISOString(), range.end.toISOString()),
  });
  const { data: household } = useQuery({
    queryKey: ["household"],
    queryFn: () => api.household.list(),
  });
  const members = useMemo(() => household?.members ?? [], [household]);

  const allEvents = useMemo(() => data?.events ?? [], [data]);
  const events = useMemo(() => applyFilter(allEvents, filter), [allEvents, filter]);

  const step = useCallback(
    (direction: 1 | -1) => {
      setAnchor((current) => {
        switch (mode) {
          case "month":
            return new Date(current.getFullYear(), current.getMonth() + direction, 1);
          case "week":
            return addDays(current, 7 * direction);
          case "day":
            return addDays(current, direction);
          case "agenda":
            return addDays(current, AGENDA_DAYS * direction);
        }
      });
    },
    [mode],
  );

  const goToday = useCallback(() => setAnchor(midnight(new Date())), []);

  /** Open a day in the day view — the month grid's drill-down. */
  const openDay = useCallback((date: Date) => {
    setAnchor(midnight(date));
    setMode("day");
  }, []);

  // Keyboard shortcuts. Skipped while a field has focus so typing a "w" into
  // the search box doesn't jump to the week view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      // The editor sheet owns the keyboard while it is open.
      if (document.querySelector("[role='dialog']")) return;

      switch (e.key.toLowerCase()) {
        case "arrowleft":
          e.preventDefault();
          step(-1);
          break;
        case "arrowright":
          e.preventDefault();
          step(1);
          break;
        case "t":
          goToday();
          break;
        case "m":
          setMode("month");
          break;
        case "w":
          setMode("week");
          break;
        case "d":
          setMode("day");
          break;
        case "a":
          setMode("agenda");
          break;
        case "n":
          setEditing({ date: anchor });
          break;
        case "/":
          e.preventDefault();
          setShowFilters(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goToday, anchor]);

  const title = titleFor(mode, anchor);
  const filtering = isFiltering(filter);

  return (
    <Panel
      className={cn("flex h-full flex-col", className)}
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 pt-1"
      icon={CalendarDays}
      accent="accent"
      title={title}
      actions={
        <>
          <div
            role="group"
            aria-label="Calendar view"
            className="mr-1 hidden items-center gap-1 rounded-pill border border-line bg-surface/60 p-1 lg:flex"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                title={`${m.label} (${m.key})`}
                onClick={() => setMode(m.id)}
                className={cn(
                  "min-h-touch rounded-pill px-4 text-body font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                  mode === m.id
                    ? "bg-accent text-white"
                    : "text-ink-3 hover:bg-raised hover:text-ink",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <TouchButton
            variant={showFilters || filtering ? "primary" : "ghost"}
            icon={SlidersHorizontal}
            iconOnly
            aria-label={showFilters ? "Hide filters" : "Show filters"}
            aria-pressed={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          />
          <TouchButton
            variant="ghost"
            icon={Download}
            iconOnly
            aria-label="Export events as an ICS file"
            onClick={() => downloadIcs(events, `home-dashboard-${dateKey(anchor)}.ics`)}
          />
          <TouchButton variant="ghost" icon={ChevronLeft} iconOnly onClick={() => step(-1)} aria-label="Previous" />
          <TouchButton variant="ghost" onClick={goToday}>Today</TouchButton>
          <TouchButton variant="ghost" icon={ChevronRight} iconOnly onClick={() => step(1)} aria-label="Next" />
          <TouchButton
            variant="primary"
            icon={Plus}
            iconOnly
            aria-label="New event"
            onClick={() => setEditing({ date: anchor })}
          />
        </>
      }
    >
      {showFilters && (
        <CalendarToolbar
          filter={filter}
          onChange={setFilter}
          members={members}
          matchCount={events.length}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* The view switcher collapses out of the header below `lg`, where seven
          controls would wrap the title onto a second line. */}
      <div
        role="group"
        aria-label="Calendar view"
        className="flex items-center gap-1 rounded-pill border border-line bg-surface/60 p-1 lg:hidden"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "min-h-touch flex-1 rounded-pill px-3 text-body font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
              mode === m.id ? "bg-accent text-white" : "text-ink-3 hover:bg-raised hover:text-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "month" && (
        <MonthGrid
          anchor={anchor}
          events={events}
          now={now}
          compact={compact}
          onOpen={setEditing}
          onCreate={(date) => setEditing({ date })}
          onExpand={openDay}
        />
      )}

      {mode === "week" && (
        <TimeGrid
          days={weekDays(anchor)}
          events={events}
          now={now}
          onOpen={setEditing}
          onCreate={(date) => setEditing({ date })}
        />
      )}

      {mode === "day" && (
        <TimeGrid
          days={[midnight(anchor)]}
          events={events}
          now={now}
          onOpen={setEditing}
          onCreate={(date) => setEditing({ date })}
          showDayHeadings={false}
        />
      )}

      {mode === "agenda" && (
        <AgendaList
          start={midnight(anchor)}
          days={AGENDA_DAYS}
          events={events}
          now={now}
          onOpen={setEditing}
          onCreate={(date) => setEditing({ date })}
          members={members}
        />
      )}

      <EventEditorSheet open={editing !== null} initial={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

interface MonthProps {
  anchor: Date;
  events: CalendarEvent[];
  now: Date;
  compact: boolean;
  onOpen: (event: CalendarEvent) => void;
  onCreate: (date: Date) => void;
  onExpand: (date: Date) => void;
}

/**
 * The month grid.
 *
 * Each cell is a button that creates an event on that day; the chips inside are
 * nested click targets that open the event instead, and the overflow count
 * drills into the day view rather than silently hiding the rest.
 */
function MonthGrid({ anchor, events, now, compact, onOpen, onCreate, onExpand }: MonthProps) {
  const cells = useMemo(
    () => monthGrid(anchor.getFullYear(), anchor.getMonth()),
    [anchor],
  );

  // How many chips fit is a function of the measured row height — a hard-coded
  // 3 renders a half-chip clipped by `overflow-hidden` on a short row, which
  // reads as a rendering bug rather than as "there is more here". The chip
  // container is measured directly (rather than derived from the cell) so the
  // date header's real height and the cell's padding are already accounted for.
  const gridRef = useRef<HTMLDivElement>(null);
  const [maxChips, setMaxChips] = useState(compact ? 2 : 3);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const box = grid.querySelector<HTMLElement>("[data-chip-box]");
      if (!box) return;
      // Reserve one line for "+N more"; it only renders when chips overflow,
      // and a count that assumed its absence would clip it.
      const withCount = box.clientHeight - OVERFLOW_LINE_PX;
      const fits = Math.floor((withCount + CHIP_GAP_PX) / (CHIP_PX + CHIP_GAP_PX));
      // A row too short for "one chip + the count" still shows one chip: an
      // event the user can read beats a "+1 more" that names nothing. At 1280
      // ×720 every row is this short, so returning 0 here hid the month's
      // events entirely.
      const floor = box.clientHeight >= CHIP_PX ? 1 : 0;
      setMaxChips(Math.max(floor, Math.min(compact ? 2 : 4, fits)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [compact]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 gap-px pb-1">
        {WEEKDAY_NAMES.map((day) => (
          <div key={day} className="py-1.5 text-center text-meta font-semibold uppercase tracking-wide text-ink-4">
            {day}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-panel border border-line">
        <div
          ref={gridRef}
          className="grid h-full min-h-[34rem] grid-cols-7 grid-rows-6 gap-px bg-line"
        >
        {cells.map((cell) => {
          const dayEvents = eventsOnDay(events, cell.date);
          const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
          return (
            <button
              key={cell.key}
              type="button"
              // A month cell is a grid square sized by the 6-row month, not a
              // control in a row. It carries its own 44px floor (see
              // e2e/layout.spec.ts) rather than the 56px control target, which
              // six rows cannot satisfy without stretching the grid into dead
              // space. Chips inside stay on the canonical type scale.
              data-calendar-day
              aria-label={`Add an event on ${cell.date.toLocaleDateString()}`}
              onClick={() => onCreate(cell.date)}
              className={cn(
                "group/day relative flex min-h-0 flex-col items-stretch gap-1 overflow-hidden p-1.5 text-left",
                "transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
                weekend ? "bg-surface/40" : "bg-panel",
                !cell.inMonth && "opacity-70",
                cell.isToday && "bg-accent-soft",
              )}
            >
              <span className="flex shrink-0 items-center justify-between gap-1">
                {/* A density dot per event, capped — the day's load at a glance
                    even where the chips themselves are cut off. */}
                <span aria-hidden className="flex gap-0.5 pl-0.5">
                  {dayEvents.slice(0, 5).map((event) => (
                    <span
                      key={event.id}
                      className="h-1.5 w-1.5 rounded-pill"
                      style={{ backgroundColor: `var(--color-${event.color}, currentColor)` }}
                    />
                  ))}
                </span>
                <span
                  className={cn(
                    "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-inner px-1 text-meta font-semibold tabular-nums",
                    cell.isToday
                      ? "bg-accent text-white"
                      : cell.inMonth
                        ? "text-ink-2"
                        : "text-ink-4",
                  )}
                >
                  {cell.date.getDate()}
                </span>
              </span>

              <div data-chip-box className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, maxChips).map((event) => (
                  <EventChip
                    key={event.id}
                    event={event}
                    onOpen={onOpen}
                    live={isNow(event, now)}
                  />
                ))}
                {dayEvents.length > maxChips && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Show all ${dayEvents.length} events on ${cell.date.toLocaleDateString()}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpand(cell.date);
                    }}
                    className="shrink-0 px-1.5 text-meta font-medium text-ink-4 hover:text-accent-ink"
                  >
                    +{dayEvents.length - maxChips} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
