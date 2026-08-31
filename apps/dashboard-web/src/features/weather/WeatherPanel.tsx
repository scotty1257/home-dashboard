import { useQuery } from "@tanstack/react-query";
import { Droplets, RefreshCw, Wind } from "lucide-react";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { AnimatedNumber } from "../../components/AnimatedNumber";
import { weatherIcon } from "../../lib/icons";
import { WeatherScene } from "./WeatherScene";
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

/** Weekday label for a YYYY-MM-DD key, read at local noon to dodge TZ edges. */
function weekday(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * Weather for the Today screen.
 *
 * The whole card is one surface: the animated scene sits behind the header as
 * well as the body (the header is transparent), so there is no seam between
 * the two. Nothing scrolls — the hourly strip and the day rows are sized to
 * fit the cell, and the row counts are chosen to fill it exactly.
 *
 * The forecast is the point of this tile, so the day names, condition icons,
 * and temperatures are set large enough to read from across the room — the
 * daily strip carries a 26px icon and metric-scale numbers, not the cramped
 * metadata scale it used to.
 */
export function WeatherPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["weather"], queryFn: api.weather });

  if (isLoading && !data) {
    return (
      <Panel title="Weather" accent="sky">
        <div className="py-8 text-center text-body text-ink-3">Loading…</div>
      </Panel>
    );
  }
  if (!data) return null;

  const { current, hourly, daily, stale, units } = data;
  const unit = units === "imperial" ? "°F" : "°C";
  const CurrentIcon = weatherIcon(current.condition, current.isDay);

  return (
    <Panel
      title="Weather"
      accent="sky"
      className="relative isolate overflow-hidden"
      headerClassName="relative z-10 bg-transparent"
      backdrop={<WeatherScene condition={current.condition} isDay={current.isDay} />}
      bodyClassName="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
      actions={
        stale ? (
          <span className="flex items-center gap-2 text-meta font-medium text-warning">
            <RefreshCw size={14} /> offline
          </span>
        ) : undefined
      }
    >
      {/* Current conditions. */}
      <div className="flex shrink-0 items-center gap-4">
        <CurrentIcon
          size={48}
          strokeWidth={1.5}
          className={cn("shrink-0", conditionTint(current.condition))}
        />
        <div className="flex items-start leading-none">
          <AnimatedNumber
            value={Math.round(current.temperature)}
            className="text-hero font-semibold tracking-tight tabular-nums"
          />
          <span className="mt-1 text-metric font-medium text-ink-2">{unit}</span>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1 text-body text-ink-2">
          <span className="font-medium text-ink">{conditionLabel(current.condition)}</span>
          <span className="text-meta">
            Feels like {Math.round(current.feelsLike)}
            {unit}
          </span>
          <span className="flex items-center gap-3 text-meta text-ink-3">
            <span className="flex items-center gap-1.5">
              <Droplets size={14} aria-hidden />
              {current.humidity}%
            </span>
            <span className="flex items-center gap-1.5">
              <Wind size={14} aria-hidden />
              {Math.round(current.windSpeed)}
            </span>
          </span>
        </div>
      </div>

      {/* Next hours — a fixed set of columns that share the width, so the strip
          never needs to scroll sideways. */}
      <div className="grid shrink-0 grid-cols-6 gap-1 border-t border-line/70 pt-3">
        {hourly.slice(0, 6).map((h, i) => {
          const Icon = weatherIcon(h.condition, current.isDay);
          return (
            <div key={h.time} className="flex flex-col items-center gap-1.5">
              <span className="text-meta text-ink-3 tabular-nums">
                {i === 0 ? "Now" : new Date(h.time).toLocaleTimeString([], { hour: "numeric" })}
              </span>
              <Icon size={22} strokeWidth={1.75} className={conditionTint(h.condition)} aria-hidden />
              <span className="text-body-lg font-medium tabular-nums">{Math.round(h.temperature)}°</span>
            </div>
          );
        })}
      </div>

      {/* Rest of the week. The list takes the remaining height and distributes
          it across the rows, so the card ends flush with its cell. Four days at
          the 16px-floor type scale is what fits without clipping; a fifth row
          would overflow the cell rather than shrink the text below the floor. */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 border-t border-line/70 pt-2">
        {daily.slice(0, 4).map((d) => {
          const Icon = weatherIcon(d.condition, true);
          return (
            <div
              key={d.date}
              className="grid flex-1 grid-cols-[3.5rem_2rem_3rem_1fr] items-center gap-3 rounded-lg px-1 text-body"
            >
              <span className="text-body-lg font-medium text-ink-2">{weekday(d.date)}</span>
              <Icon
                size={26}
                strokeWidth={1.75}
                className={cn("shrink-0", conditionTint(d.condition))}
                aria-hidden
              />
              <span className="text-body font-medium text-sky tabular-nums">
                {d.precipitationProbability > 10 ? `${d.precipitationProbability}%` : ""}
              </span>
              <span className="text-right tabular-nums text-ink-3">
                <span className="text-metric font-semibold text-ink">{Math.round(d.high)}°</span>{" "}
                <span className="text-body-lg">/ {Math.round(d.low)}°</span>
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
