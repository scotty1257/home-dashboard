import { useQuery } from "@tanstack/react-query";
import type { ActivityItem } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import "./ActivityFeed.css";

const KIND_ICON: Record<string, string> = {
  "event-now": "🟢",
  "event-upcoming": "🗓️",
  media: "🎵",
  timer: "⏲️",
  alert: "⚠️",
  device: "🔔",
  system: "⚙️",
};

export function ActivityFeed() {
  const { data } = useQuery({ queryKey: ["activity"], queryFn: api.activity, refetchInterval: 30_000 });

  if (!data) {
    return (
      <Panel title="Now & Upcoming" icon="✨" accent="amber">
        <div className="activity-empty">Nothing scheduled</div>
      </Panel>
    );
  }

  const items = data.items.slice(0, 6);

  return (
    <Panel title="Now & Upcoming" icon="✨" accent="amber">
      {items.length === 0 ? (
        <div className="activity-empty">Nothing scheduled</div>
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li key={item.id} className={`activity-item activity-item--${item.severity}`}>
              <span className="activity-item__icon">{KIND_ICON[item.kind] ?? "•"}</span>
              <div className="activity-item__body">
                <span className="activity-item__title">{item.title}</span>
                {item.subtitle && <span className="activity-item__subtitle">{item.subtitle}</span>}
              </div>
              {item.kind === "event-upcoming" && item.at && (
                <span className="activity-item__when">{relative(item.at)}</span>
              )}
            </li>
          ))}
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
  const days = Math.round(hours / 24);
  return `${days}d`;
}
