import type {
  DailyForecast,
  HourlyForecast,
  WeatherCondition,
  WeatherReport,
} from "@home-dashboard/contracts";

function mapCode(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunderstorm";
  return "cloudy";
}

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    surface_pressure: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export interface WeatherProviderOptions {
  latitude: number;
  longitude: number;
  units: "imperial" | "metric";
  timezone: string;
}

export async function fetchOpenMeteo(opts: WeatherProviderOptions): Promise<WeatherReport> {
  const tempUnit = opts.units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = opts.units === "imperial" ? "mph" : "kmh";
  const precipUnit = opts.units === "imperial" ? "inch" : "mm";

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(opts.latitude));
  url.searchParams.set("longitude", String(opts.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
  );
  url.searchParams.set("hourly", "temperature_2m,weather_code,precipitation_probability");
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset",
  );
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("timezone", opts.timezone);
  url.searchParams.set("temperature_unit", tempUnit);
  url.searchParams.set("wind_speed_unit", windUnit);
  url.searchParams.set("precipitation_unit", precipUnit);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const current = data.current;
  const hourly: HourlyForecast[] = data.hourly.time
    .slice(0, 24)
    .map((time, i) => ({
      time: new Date(time).toISOString(),
      temperature: data.hourly.temperature_2m[i] ?? 0,
      condition: mapCode(data.hourly.weather_code[i] ?? 0),
      precipitationProbability: data.hourly.precipitation_probability[i] ?? 0,
    }));

  const daily: DailyForecast[] = data.daily.time.map((date, i) => ({
    date,
    high: data.daily.temperature_2m_max[i] ?? 0,
    low: data.daily.temperature_2m_min[i] ?? 0,
    condition: mapCode(data.daily.weather_code[i] ?? 0),
    precipitationProbability: data.daily.precipitation_probability_max[i] ?? 0,
  }));

  const sunrise = data.daily.sunrise[0] ? new Date(data.daily.sunrise[0]).toISOString() : undefined;
  const sunset = data.daily.sunset[0] ? new Date(data.daily.sunset[0]).toISOString() : undefined;

  return {
    location: `${opts.latitude.toFixed(2)}, ${opts.longitude.toFixed(2)}`,
    units: opts.units,
    current: {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      condition: mapCode(current.weather_code),
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      precipitation: current.precipitation,
      pressure: current.surface_pressure,
      isDay: current.is_day === 1,
      sunrise,
      sunset,
      updatedAt: new Date().toISOString(),
    },
    hourly,
    daily,
    alerts: [],
    stale: false,
  };
}
