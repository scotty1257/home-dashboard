import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Bell, Music2, Sparkles, AlertTriangle, DoorOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { cn } from "../../lib/cn";

const KIND_ICON: Record<string, LucideIcon> = {
  "event-now": CalendarClock,
  "event-upcoming": Sparkles,
  media: Music2,
  timer: Bell,
  alert: AlertTriangle,
  device: DoorOpen,
  system: Bell,
};

interface Props {
  /**
   * Rail variant for the Today context column: at most 4 items in a tight
   * internally-scrolling list.
   */
  compact?: boolean;
}

export function ActivityFeed({ compact = false }: Props) {
  const { data } = useQuery({ queryKey: ["activity"], queryFn: api.activity, refetchInterval: 30_000 });

  if (!data) {
    return (
      <Panel title="Now & Upcoming" accent="amber" density={compact ? "compact" : "default"}>
        <div className={cn("text-center text-sm text-ink-3", compact ? "py-3" : "py-4")}>
          Nothing scheduled
        </div>
      </Panel>
    );
  }

  const items = data.items.slice(0, compact ? 4 : 6);

  return (
    <Panel
      title="Now & Upcoming"
      accent="amber"
      density={compact ? "compact" : "default"}
      bodyClassName={compact ? "min-h-0 flex-1 overflow-y-auto pb-2 pt-0" : undefined}
    >
      {items.length === 0 ? (
        <div className={cn("text-center text-sm text-ink-3", compact ? "py-3" : "py-4")}>
          Nothing scheduled
        </div>
      ) : (
        <ul className={cn("flex flex-col", compact ? "gap-0.5" : "gap-0.5")}>
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? Bell;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 hover:bg-surface",
                  compact ? "min-h-9 py-1" : "py-1.5",
                )}
              >
                <Icon
                  size={compact ? 14 : 16}
                  strokeWidth={1.75}
                  className={cn("shrink-0", item.severity === "warning" ? "text-warning" : "text-ink-3")}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("truncate font-medium text-ink", compact ? "text-xs" : "text-sm")}>
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className={cn("truncate text-ink-3", compact ? "text-xs" : "text-xs")}>
                      {item.subtitle}
                    </span>
                  )}
                </div>
                {item.kind === "event-upcoming" && item.at && (
                  <span className="shrink-0 text-xs tabular-nums text-ink-4">{relative(item.at)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
