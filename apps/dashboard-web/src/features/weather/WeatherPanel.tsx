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

interface Props {
  /**
   * Rail variant for the Today context column: current conditions plus the
   * 5-day outlook only (no hourly strip), compacted to share a short column.
   */
  compact?: boolean;
}

export function WeatherPanel({ compact = false }: Props) {
  const { data, isLoading } = useQuery({ queryKey: ["weather"], queryFn: api.weather });

  if (isLoading && !data) {
    return (
      <Panel title="Weather" accent="sky" density={compact ? "compact" : "default"}>
        <div className={cn("text-center text-sm text-ink-3", compact ? "py-4" : "py-8")}>Loading…</div>
      </Panel>
    );
  }
  if (!data) return null;

  const { current, hourly, daily, stale, units } = data;
  const unit = units === "imperial" ? "°F" : "°C";
  const CurrentIcon = weatherIcon(current.condition);

  const days = daily.slice(0, 5);

  return (
    <Panel
      title="Weather"
      accent="sky"
      density={compact ? "compact" : "default"}
      bodyClassName={compact ? "pb-2 pt-0" : undefined}
      actions={
        stale ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
            <RefreshCw size={12} /> offline
          </span>
        ) : undefined
      }
    >
      <div className={cn("flex items-center", compact ? "gap-3" : "gap-4")}>
        <CurrentIcon
          size={compact ? 28 : 40}
          strokeWidth={1.75}
          className={cn("shrink-0", conditionTint(current.condition))}
        />
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-semibold leading-none tracking-tight tabular-nums",
              compact ? "text-2xl" : "text-[40px]",
            )}
          >
            {Math.round(current.temperature)}
            <span className={compact ? "text-sm" : "text-xl"}>{unit}</span>
          </span>
        </div>
        <div className={cn("ml-auto flex flex-col items-end gap-0.5 text-sm text-ink-2", compact && "text-xs")}>
          <span className={cn("font-medium text-ink", compact && "text-xs")}>
            {conditionLabel(current.condition)}
          </span>
          <span>
            Feels like {Math.round(current.feelsLike)}{unit}
          </span>
          <span className="flex items-center gap-3 text-ink-3">
            <span className="flex items-center gap-1">
              <Droplets size={13} />
              {current.humidity}%
            </span>
            <span className="flex items-center gap-1">
              <Wind size={13} />
              {Math.round(current.windSpeed)}
            </span>
          </span>
        </div>
      </div>

      {/* Hourly strip: full panel only — the compact rail keeps to current + 5-day. */}
      {!compact && (
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
      )}

      {compact ? (
        // Two columns of tight day rows so the 5-day fits a short rail cell.
        <div className="mt-1 grid grid-cols-2 gap-x-2">
          {days.map((d) => {
            const Icon = weatherIcon(d.condition);
            return (
              <div key={d.date} className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs">
                <span className="w-8 shrink-0 text-ink-3">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <Icon size={13} strokeWidth={1.75} className={cn("shrink-0", conditionTint(d.condition))} />
                <span className="shrink-0 text-right font-medium text-sky">
                  {d.precipitationProbability > 10 ? `${d.precipitationProbability}%` : ""}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-ink-3">
                  <span className="font-semibold text-ink">{Math.round(d.high)}°</span> / {Math.round(d.low)}°
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 flex flex-col">
          {days.map((d) => {
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
      )}
    </Panel>
  );
}
