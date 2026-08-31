import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, ArrowLeftRight } from "lucide-react";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";
import {
  eventsOnDay,
  monthGrid,
  MONTH_NAMES,
  WEEKDAY_NAMES,
} from "./calendarUtils";
import { EventEditorSheet } from "./EventEditorSheet";

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface Props {
  compact?: boolean;
  className?: string;
}

export function CalendarPanel({ compact = false, className }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [editing, setEditing] = useState<CalendarEvent | { date: Date } | null>(null);

  const range = monthRange(cursor.year, cursor.month);
  const { data } = useQuery({
    queryKey: ["calendar", range.start, range.end],
    queryFn: () => api.calendar.list(range.start, range.end),
  });
  const events = useMemo(() => data?.events ?? [], [data]);
  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const prev = () =>
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  const next = () =>
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  const todayNav = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });

  const maxChips = compact ? 2 : 3;

  return (
    <Panel
      className={cn("flex h-full flex-col", className)}
      bodyClassName="flex flex-1 flex-col pt-1"
      icon={CalendarDays}
      accent="accent"
      title={`${MONTH_NAMES[cursor.month]} ${cursor.year}`}
      actions={
        <>
          <TouchButton variant="ghost" icon={ChevronLeft} iconOnly onClick={prev} aria-label="Previous month" />
          <TouchButton variant="ghost" onClick={todayNav}>Today</TouchButton>
          <TouchButton variant="ghost" icon={ChevronRight} iconOnly onClick={next} aria-label="Next month" />
        </>
      }
    >
      <div className="grid grid-cols-7 gap-px pb-1">
        {WEEKDAY_NAMES.map((d) => (
          <div key={d} className="py-1.5 text-center text-meta font-semibold uppercase tracking-wide text-ink-4">
            {d}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-panel border border-line bg-line">
        {cells.map((cell) => {
          const dayEvents = eventsOnDay(events, cell.date);
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setEditing({ date: cell.date })}
              className={cn(
                "flex min-h-0 flex-col items-stretch gap-1 overflow-hidden bg-panel p-1.5 text-left",
                "transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2/60",
                !cell.inMonth && "opacity-45",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-inner text-body font-medium tabular-nums",
                  cell.isToday
                    ? "bg-accent text-white"
                    : cell.inMonth
                      ? "text-ink-2"
                      : "text-ink-4",
                )}
              >
                {cell.date.getDate()}
              </span>
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, maxChips).map((e) => (
                  <span
                    key={e.id}
                    role="button"
                    tabIndex={-1}
                    data-testid="event-chip"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing(e);
                    }}
                    className="flex min-h-7 shrink-0 items-center gap-1.5 truncate rounded-inner px-1.5 py-0.5 text-meta font-medium leading-tight"
                    style={{ backgroundColor: `${colorOf(e.color)}1f`, color: colorOf(e.color) }}
                  >
                    {!e.allDay && <span className="opacity-70 tabular-nums">{timeShort(e.start)}</span>}
                    <span className="truncate">{e.title}</span>
                    {e.requiresHandoff && (
                      <ArrowLeftRight aria-label="Handoff" size={12} className="shrink-0" />
                    )}
                  </span>
                ))}
                {dayEvents.length > maxChips && (
                  <span className="shrink-0 px-1.5 text-meta font-medium text-ink-4">
                    +{dayEvents.length - maxChips}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <EventEditorSheet open={editing !== null} initial={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
