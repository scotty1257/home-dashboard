import { useQuery } from "@tanstack/react-query";
import { Droplets, MapPin, RefreshCw, Umbrella, Wind } from "lucide-react";
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
      return "text-ink-amber";
    case "rain":
    case "drizzle":
    case "snow":
    case "sleet":
      return "text-ink-sky";
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
 * The layout is dense on purpose. The previous version spread the current
 * conditions across three widely-separated columns and gave the daily rows a
 * fixed precipitation column that was blank whenever the chance was under 10%,
 * so most of the card was empty. Now the temperature, condition and metrics sit
 * in one cluster, and precipitation rides with the day's icon only when there
 * is some — which leaves room for five days instead of four.
 */
export function WeatherPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["weather"], queryFn: api.weather });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });

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

  // The report's own `location` is whatever the provider echoed back — raw
  // coordinates ("40.71, -74.01") from Open-Meteo, or "Demo location" offline.
  // A saved label is the presentable name, so prefer it and fall back.
  const place = settings?.weatherLocation?.label?.trim() || data.location;

  return (
    <Panel
      title="Weather"
      accent="sky"
      className="relative isolate overflow-hidden"
      headerClassName="relative z-10 bg-transparent"
      backdrop={<WeatherScene condition={current.condition} isDay={current.isDay} />}
      bodyClassName="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
      actions={
        <span className="flex items-center gap-3">
          {/* Which place this forecast is for — it was never shown at all. */}
          <span className="flex min-w-0 items-center gap-1.5 text-meta text-ink-3">
            <MapPin size={16} aria-hidden className="shrink-0" />
            <span className="truncate">{place}</span>
          </span>
          {stale && (
            <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-warning">
              <RefreshCw size={16} aria-hidden /> offline
            </span>
          )}
        </span>
      }
    >
      {/* Current conditions — icon, temperature and label bound together, with
          the metrics on one line beneath rather than stranded in a far column. */}
      <div className="flex shrink-0 items-center gap-3">
        <CurrentIcon
          size={56}
          strokeWidth={1.5}
          className={cn("shrink-0", conditionTint(current.condition))}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-start leading-none">
            <AnimatedNumber
              value={Math.round(current.temperature)}
              className="text-hero font-semibold tracking-tight tabular-nums"
            />
            <span className="mt-1 text-metric font-medium text-ink-2">{unit}</span>
            <span className="ml-3 mt-2 truncate text-title font-medium text-ink">
              {conditionLabel(current.condition)}
            </span>
          </div>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-3">
            <span>
              Feels like {Math.round(current.feelsLike)}
              {unit}
            </span>
            <span className="flex items-center gap-1.5">
              <Droplets size={16} aria-hidden />
              {current.humidity}%
            </span>
            <span className="flex items-center gap-1.5">
              <Wind size={16} aria-hidden />
              {Math.round(current.windSpeed)}
            </span>
          </span>
        </div>
      </div>

      {/* Next hours — a fixed set of columns that share the width, so the strip
          never needs to scroll sideways. */}
      <div className="grid shrink-0 grid-cols-6 gap-1 border-t border-line/70 pt-2">
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
          it across the rows, so the card ends flush with its cell.
          Precipitation rides beside the icon only when there is a real chance
          of it — it used to hold a fixed column that was blank most days.
          Four rows is what the cell fits without clipping (the layout audit
          fails on a single overflowing pixel); a fifth needs a taller tile. */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 border-t border-line/70 pt-2">
        {daily.slice(0, 4).map((d) => {
          const Icon = weatherIcon(d.condition, true);
          const wet = d.precipitationProbability > 10;
          return (
            <div
              key={d.date}
              className="grid min-h-0 flex-1 grid-cols-[4rem_1fr_auto] items-center gap-3 rounded-inner px-1 text-body leading-none"
            >
              <span className="text-body font-medium text-ink-2">{weekday(d.date)}</span>
              <span className="flex items-center gap-2">
                <Icon
                  size={22}
                  strokeWidth={1.75}
                  className={cn("shrink-0", conditionTint(d.condition))}
                  aria-hidden
                />
                {wet && (
                  <span className="flex items-center gap-1 text-meta font-medium tabular-nums text-ink-sky">
                    <Umbrella size={16} aria-hidden />
                    {d.precipitationProbability}%
                  </span>
                )}
              </span>
              <span className="text-right leading-none tabular-nums text-ink-3">
                <span className="text-body-lg font-semibold text-ink">{Math.round(d.high)}°</span>{" "}
                <span className="text-body">/ {Math.round(d.low)}°</span>
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
