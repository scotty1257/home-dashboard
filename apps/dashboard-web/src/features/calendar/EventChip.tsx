import { ArrowLeftRight, MapPin, Repeat } from "lucide-react";
import type { CalendarEvent } from "@home-dashboard/contracts";
import { colorOf, inkColorOf, softColor } from "../../lib/colors";
import { cn } from "../../lib/cn";

/** Local time as "9:30 AM" — the calendar's one time format. */
export function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "9:30 AM – 10:30 AM", or "All day". */
export function timeRange(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  return `${timeShort(event.start)} – ${timeShort(event.end)}`;
}

/** True while the event is happening. */
export function isNow(event: CalendarEvent, now: Date): boolean {
  const t = now.getTime();
  return new Date(event.start).getTime() <= t && t < new Date(event.end).getTime();
}

interface Props {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  /** Marks the event as in progress: a live ring plus a stronger fill. */
  live?: boolean;
  /** Hide the leading time (month cells on the narrow viewport). */
  hideTime?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One event as a colored pill.
 *
 * The event's own color carries the identity, so the chip is a tinted fill plus
 * a saturated left edge rather than a solid block — a month cell with four
 * solid chips reads as a color chart, not a day. Rendered as a `span` with a
 * button role because month chips are nested inside the day cell's button, and
 * a button inside a button is invalid HTML.
 */
export function EventChip({ event, onOpen, live = false, hideTime = false, className, style }: Props) {
  const color = colorOf(event.color);
  // The bright is the fill and the edge; the label needs the readable variant.
  const ink = inkColorOf(event.color);
  const recurring = event.recurrence?.frequency !== "none";

  return (
    <span
      role="button"
      tabIndex={-1}
      data-testid="event-chip"
      title={`${event.title} — ${timeRange(event)}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(event);
      }}
      className={cn(
        "group/chip relative flex min-h-7 shrink-0 items-center gap-1.5 overflow-hidden",
        "rounded-inner pl-2 pr-1.5 py-0.5 text-meta font-medium leading-tight",
        "transition-[transform,filter] duration-[var(--dur-fast)] hover:brightness-105",
        "motion-safe:hover:-translate-y-px",
        live && "chip-live",
        className,
      )}
      style={{
        backgroundColor: softColor(event.color, live ? 0.3 : 0.18),
        color: ink,
        boxShadow: `inset 3px 0 0 ${color}`,
        ...style,
      }}
    >
      {!event.allDay && !hideTime && (
        <span className="shrink-0 opacity-75 tabular-nums">{timeShort(event.start)}</span>
      )}
      <span className="truncate">{event.title}</span>
      {recurring && <Repeat aria-label="Repeats" size={12} className="shrink-0 opacity-70" />}
      {event.location && <MapPin aria-label="Has a location" size={12} className="shrink-0 opacity-70" />}
      {event.requiresHandoff && (
        <ArrowLeftRight aria-label="Handoff" size={12} className="shrink-0" />
      )}
    </span>
  );
}
