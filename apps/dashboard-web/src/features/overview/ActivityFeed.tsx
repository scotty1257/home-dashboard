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

export function ActivityFeed() {
  const { data } = useQuery({ queryKey: ["activity"], queryFn: api.activity, refetchInterval: 30_000 });

  if (!data) {
    return (
      <Panel title="Now & Upcoming" accent="amber">
        <div className="py-4 text-center text-sm text-ink-3">Nothing scheduled</div>
      </Panel>
    );
  }

  const items = data.items.slice(0, 6);

  return (
    <Panel title="Now & Upcoming" accent="amber">
      {items.length === 0 ? (
        <div className="py-4 text-center text-sm text-ink-3">Nothing scheduled</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? Bell;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface">
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  className={cn("shrink-0", item.severity === "warning" ? "text-warning" : "text-ink-3")}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-ink">{item.title}</span>
                  {item.subtitle && <span className="truncate text-xs text-ink-3">{item.subtitle}</span>}
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
