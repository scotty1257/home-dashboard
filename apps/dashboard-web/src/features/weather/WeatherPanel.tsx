import { useQuery } from "@tanstack/react-query";
import { Droplets, Wind, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { weatherIcon } from "../../lib/icons";
import { conditionLabel } from "../../lib/format";
import { cn } from "../../lib/cn";

function conditionTint(condition: string): string {
  switch (condition) {
    case "clear":
    case "partly-cloudy":
      return "text-amber";
    case "rain":
    case "drizzle":
    case "snow":
    case "sleet":
      return "text-sky";
    case "thunderstorm":
      return "text-warning";
    default:
      return "text-ink-3";
  }
}

export function WeatherPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["weather"], queryFn: api.weather });

  if (isLoading && !data) {
    return (
      <Panel title="Weather" accent="sky">
        <div className="py-8 text-center text-sm text-ink-3">Loading…</div>
      </Panel>
    );
  }
  if (!data) return null;

  const { current, hourly, daily, stale, units } = data;
  const unit = units === "imperial" ? "°F" : "°C";
  const CurrentIcon = weatherIcon(current.condition);

  return (
    <Panel
      title="Weather"
      accent="sky"
      actions={
        stale ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
            <RefreshCw size={12} /> offline
          </span>
        ) : undefined
      }
    >
      <div className="flex items-center gap-4">
        <CurrentIcon size={40} strokeWidth={1.75} className={cn("shrink-0", conditionTint(current.condition))} />
        <div className="flex items-baseline gap-1">
          <span className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {Math.round(current.temperature)}
            <span className="text-xl">{unit}</span>
          </span>
        </div>
        <div className="ml-auto flex flex-col items-end gap-0.5 text-sm text-ink-2">
          <span className="font-medium text-ink">{conditionLabel(current.condition)}</span>
          <span>Feels like {Math.round(current.feelsLike)}{unit}</span>
          <span className="flex items-center gap-3 text-ink-3">
            <span className="flex items-center gap-1"><Droplets size={13} />{current.humidity}%</span>
            <span className="flex items-center gap-1"><Wind size={13} />{Math.round(current.windSpeed)}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {hourly.slice(0, 12).map((h, i) => {
          const Icon = weatherIcon(h.condition);
          return (
            <div key={h.time} className="flex min-w-[52px] flex-col items-center gap-1 rounded-md px-1 py-2">
              <span className="text-[11px] text-ink-3 tabular-nums">{i === 0 ? "Now" : new Date(h.time).getHours()}</span>
              <Icon size={16} strokeWidth={1.75} className={conditionTint(h.condition)} />
              <span className="text-xs font-medium tabular-nums">{Math.round(h.temperature)}°</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-col">
        {daily.slice(0, 5).map((d) => {
          const Icon = weatherIcon(d.condition);
          return (
            <div key={d.date} className="grid grid-cols-[44px_28px_36px_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface">
              <span className="text-ink-3">
                {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <Icon size={16} strokeWidth={1.75} className={conditionTint(d.condition)} />
              <span className="text-right text-xs font-medium text-sky">
                {d.precipitationProbability > 10 ? `${d.precipitationProbability}%` : ""}
              </span>
              <span className="text-right tabular-nums text-ink-3">
                <span className="font-semibold text-ink">{Math.round(d.high)}°</span> / {Math.round(d.low)}°
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
