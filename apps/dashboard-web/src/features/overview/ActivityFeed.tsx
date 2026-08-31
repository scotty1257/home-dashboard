import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  AlertTriangle,
  Bell,
  Bus,
  CalendarClock,
  GraduationCap,
  Phone,
  Stethoscope,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { ActivityItem } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { cn } from "../../lib/cn";

/**
 * What belongs on the schedule. The activity feed also carries now-playing
 * media, home-device states, and family alerts — media duplicates the player
 * sitting right beside this panel, and family alerts live in the notification
 * drawer, so neither belongs in "what's next".
 */
const SCHEDULED: readonly string[] = ["event-now", "event-upcoming", "timer", "alert"];

/**
 * Icon per event *type*, not per feed kind. The activity contract has no
 * category field, so the type is read out of the words the family actually
 * uses. Every upcoming item sharing one sparkle icon told the reader nothing;
 * a phone glyph versus a school glyph is legible at a glance from the doorway.
 */
const TITLE_ICONS: readonly (readonly [RegExp, LucideIcon])[] = [
  [/\b(call|phone|zoom|meeting|standup|1:1)\b/i, Phone],
  [/\b(pickup|drop-?off|bus|carpool|collect)\b/i, Bus],
  [/\b(school|class|lesson|practice|homework|dismissal)\b/i, GraduationCap],
  [/\b(doctor|dentist|appt|appointment|checkup|vet)\b/i, Stethoscope],
  [/\b(dinner|lunch|breakfast|supper|meal|cook)\b/i, Utensils],
];

function iconFor(item: ActivityItem): LucideIcon {
  if (item.kind === "alert") return AlertTriangle;
  if (item.kind === "timer") return AlarmClock;
  if (item.kind === "event-now") return CalendarClock;
  const haystack = `${item.title} ${item.subtitle ?? ""}`;
  for (const [pattern, Icon] of TITLE_ICONS) {
    if (pattern.test(haystack)) return Icon;
  }
  return CalendarClock;
}

/** Day bucket for an item, so the list can carry Today / Tomorrow dividers. */
function dayLabel(iso: string): string {
  const at = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((at.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: "long" });
  return at.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/**
 * The API's subtitle for a scheduled event is the formatted start date
 * ("Mon, Aug 31, 4:00 PM"), which would read as a duplicate beside the
 * countdown. Drop those and keep subtitles that say something else.
 */
function extraSubtitle(item: ActivityItem): string | undefined {
  const sub = item.subtitle?.trim();
  if (!sub) return undefined;
  const looksLikeDate = /\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(sub);
  return looksLikeDate ? undefined : sub;
}

/** Countdown for imminent items, clock time for anything further out. */
function whenLabel(iso: string): string {
  const at = new Date(iso);
  const mins = Math.round((at.getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 180) {
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  }
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ActivityFeed() {
  const { data } = useQuery({ queryKey: ["activity"], queryFn: api.activity, refetchInterval: 30_000 });

  const items = (data?.items ?? [])
    .filter((item) => SCHEDULED.includes(item.kind))
    .slice(0, 10);

  return (
    <Panel title="Now & Upcoming" accent="amber" bodyClassName="flex min-h-0 flex-col">
      {items.length === 0 ? (
        // A real all-clear rather than a shrug. If the schedule is empty that
        // is good news and the card should say so.
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="text-metric font-semibold text-ink-2">Nothing scheduled</span>
          <span className="text-body text-ink-3">The rest of the day is clear.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => {
            const Icon = iconFor(item);
            const day = dayLabel(item.at);
            const previous = i > 0 ? items[i - 1] : undefined;
            const newDay = !previous || day !== dayLabel(previous.at);
            const isNow = item.kind === "event-now";
            return (
              <li
                key={item.id}
                className="stagger-item"
                style={{ "--stagger-delay": `${i * 40}ms` } as CSSProperties}
              >
                {/* Day divider, so a list spanning several days reads as a
                    schedule instead of an undifferentiated stack. */}
                {newDay && (
                  <div className="flex items-center gap-3 px-2 pb-1 pt-3 first:pt-0">
                    <span className="text-meta font-semibold text-ink-3">{day}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-inner px-2 py-2",
                    isNow && "bg-accent-soft",
                  )}
                >
                  <Icon
                    size={24}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0",
                      item.severity === "warning" || item.severity === "alert"
                        ? "text-warning"
                        : isNow
                          ? "text-accent"
                          : "text-ink-3",
                    )}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-ink">{item.title}</span>
                    {/* Time sits with its event, not stranded in a far column
                        several hundred pixels away from the words it belongs to.
                        The server's subtitle for scheduled events is just the
                        formatted date, which whenLabel already says better — so
                        it is only shown when it carries something else. */}
                    <span className="truncate text-meta text-ink-3">
                      <span className="font-medium tabular-nums text-ink-2">
                        {whenLabel(item.at)}
                      </span>
                      {extraSubtitle(item) ? ` · ${extraSubtitle(item)}` : ""}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
