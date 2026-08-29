import { z } from "zod";
import { IsoDate } from "./core";

export const WeatherCondition = z.enum([
  "clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "rain",
  "drizzle",
  "snow",
  "sleet",
  "thunderstorm",
  "windy",
]);
export type WeatherCondition = z.infer<typeof WeatherCondition>;

export const CurrentWeather = z.object({
  temperature: z.number(),
  feelsLike: z.number(),
  condition: WeatherCondition,
  humidity: z.number(), // percent
  windSpeed: z.number(), // km/h or mph depending on units
  windDirection: z.number(), // degrees
  precipitation: z.number(), // mm or in
  pressure: z.number(), // hPa
  uvIndex: z.number().optional(),
  sunrise: IsoDate.optional(),
  sunset: IsoDate.optional(),
  isDay: z.boolean(),
  updatedAt: IsoDate,
});
export type CurrentWeather = z.infer<typeof CurrentWeather>;

export const HourlyForecast = z.object({
  time: IsoDate,
  temperature: z.number(),
  condition: WeatherCondition,
  precipitationProbability: z.number(),
});
export type HourlyForecast = z.infer<typeof HourlyForecast>;

export const DailyForecast = z.object({
  date: z.string(), // YYYY-MM-DD
  high: z.number(),
  low: z.number(),
  condition: WeatherCondition,
  precipitationProbability: z.number(),
});
export type DailyForecast = z.infer<typeof DailyForecast>;

export const WeatherReport = z.object({
  location: z.string(),
  units: z.enum(["imperial", "metric"]),
  current: CurrentWeather,
  hourly: z.array(HourlyForecast),
  daily: z.array(DailyForecast),
  alerts: z.array(
    z.object({ headline: z.string(), description: z.string(), severity: z.string() }),
  ),
  /** True when this report was served from cache rather than a fresh fetch. */
  stale: z.boolean().default(false),
});
export type WeatherReport = z.infer<typeof WeatherReport>;
