import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { colorOf } from "../../lib/format";
import {
  eventsOnDay,
  monthGrid,
  MONTH_NAMES,
  WEEKDAY_NAMES,
} from "./calendarUtils";
import { EventEditorSheet } from "./EventEditorSheet";
import "./CalendarPanel.css";

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface Props {
  compact?: boolean;
}

export function CalendarPanel({ compact = false }: Props) {
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

  return (
    <Panel
      className="calendar-panel"
      title={`${MONTH_NAMES[cursor.month]} ${cursor.year}`}
      icon="🗓️"
      accent="coral"
      actions={
        <>
          <TouchButton variant="ghost" onClick={prev} aria-label="Previous month">‹</TouchButton>
          <TouchButton variant="ghost" onClick={todayNav}>Today</TouchButton>
          <TouchButton variant="ghost" onClick={next} aria-label="Next month">›</TouchButton>
        </>
      }
    >
      <div className="calendar-grid">
        {WEEKDAY_NAMES.map((d) => (
          <div key={d} className="calendar-weekday">{d}</div>
        ))}
        {cells.map((cell) => {
          const dayEvents = eventsOnDay(events, cell.date);
          return (
            <button
              key={cell.key}
              type="button"
              className={[
                "calendar-cell",
                cell.inMonth ? "" : "calendar-cell--out",
                cell.isToday ? "calendar-cell--today" : "",
              ].join(" ")}
              onClick={() => setEditing({ date: cell.date })}
            >
              <span className="calendar-cell__num">{cell.date.getDate()}</span>
              <div className="calendar-cell__events">
                {dayEvents.slice(0, compact ? 2 : 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="calendar-chip"
                    style={{ background: colorOf(e.color) }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing(e);
                    }}
                  >
                    {e.allDay ? "" : <span className="calendar-chip__time">{timeShort(e.start)}</span>}
                    <span className="calendar-chip__label">{e.title}</span>
                  </button>
                ))}
                {dayEvents.length > (compact ? 2 : 3) && (
                  <span className="calendar-cell__more">+{dayEvents.length - (compact ? 2 : 3)}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <EventEditorSheet
        open={editing !== null}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    </Panel>
  );
}

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
