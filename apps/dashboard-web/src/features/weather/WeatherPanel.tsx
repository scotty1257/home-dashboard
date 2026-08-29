import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { conditionIcon } from "../../lib/format";
import "./WeatherPanel.css";

export function WeatherPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["weather"], queryFn: api.weather });

  if (isLoading && !data) {
    return (
      <Panel title="Weather" icon="🌤️" accent="sky">
        <div className="weather-loading">Loading…</div>
      </Panel>
    );
  }

  const report = data;
  if (!report) return null;

  const { current, hourly, daily, stale, units } = report;
  const unit = units === "imperial" ? "°F" : "°C";

  return (
    <Panel
      title={stale ? "Weather (offline)" : "Weather"}
      icon="🌤️"
      accent="sky"
      actions={stale ? <span className="weather-stale">stale</span> : undefined}
    >
      <div className="weather-current">
        <div className="weather-current__icon">{conditionIcon(current.condition)}</div>
        <div className="weather-current__temp">{Math.round(current.temperature)}{unit}</div>
        <div className="weather-current__meta">
          <span className="weather-current__cond">{conditionLabel(current.condition)}</span>
          <span>Feels like {Math.round(current.feelsLike)}{unit}</span>
          <span>💧 {current.humidity}% · 💨 {Math.round(current.windSpeed)}</span>
        </div>
      </div>

      <div className="weather-hourly">
        {hourly.slice(0, 12).map((h, i) => (
          <div key={h.time} className="weather-hourly__item">
            <span className="weather-hourly__time">{i === 0 ? "Now" : new Date(h.time).getHours()}</span>
            <span className="weather-hourly__icon">{conditionIcon(h.condition)}</span>
            <span className="weather-hourly__temp">{Math.round(h.temperature)}°</span>
          </div>
        ))}
      </div>

      <div className="weather-daily">
        {daily.slice(0, 5).map((d) => (
          <div key={d.date} className="weather-daily__row">
            <span className="weather-daily__day">
              {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span className="weather-daily__icon">{conditionIcon(d.condition)}</span>
            <span className="weather-daily__precip">{d.precipitationProbability > 10 ? `${d.precipitationProbability}%` : ""}</span>
            <span className="weather-daily__temps">
              <b>{Math.round(d.high)}°</b> {Math.round(d.low)}°
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function conditionLabel(c: string): string {
  return c.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}
