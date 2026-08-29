import { z } from "zod";
import { ColorToken } from "./core";

export const DashboardSettings = z.object({
  theme: z.enum(["light", "dark", "auto"]).default("dark"),
  locale: z.string().default("en-US"),
  timezone: z.string().default("UTC"),
  temperatureUnits: z.enum(["imperial", "metric"]).default("imperial"),
  weatherLocation: z
    .object({
      label: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable()
    .default(null),
  defaultCalendarView: z.enum(["month", "week", "day", "agenda"]).default("month"),
  nightModeEnabled: z.boolean().default(false),
  nightDimStart: z.string().default("22:00"),
  nightDimEnd: z.string().default("07:00"),
  voice: z
    .object({
      wakeWordEnabled: z.boolean().default(false),
      pushToTalkEnabled: z.boolean().default(true),
      confirmHighRisk: z.boolean().default(true),
    })
    .default({ wakeWordEnabled: false, pushToTalkEnabled: true, confirmHighRisk: true }),
  accentColor: ColorToken.default("coral"),
});
export type DashboardSettings = z.infer<typeof DashboardSettings>;

export const DashboardSettingsPatch = DashboardSettings.partial();
export type DashboardSettingsPatch = z.infer<typeof DashboardSettingsPatch>;
