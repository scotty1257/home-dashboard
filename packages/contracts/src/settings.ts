import { z } from "zod";
import { ColorToken } from "./core";

/** HH:MM, 24-hour local time. */
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Family-coordination defaults (handoff alerting and duty rollups). */
export const FamilySettings = z.object({
  /** Local time the night-before handoff board starts demanding attention. */
  handoffAlertTime: z.string().regex(LOCAL_TIME).default("18:00"),
  /** Buffer before an event for travel when detecting conflicts. */
  travelBufferMinutes: z.number().int().min(0).max(120).default(15),
  /** Buffer after an event for overrun when detecting conflicts. */
  overrunBufferMinutes: z.number().int().min(0).max(120).default(15),
  /** Rolling window (days) covered by the duty summary. */
  dutyWindowDays: z.number().int().min(1).max(365).default(30),
});
export type FamilySettings = z.infer<typeof FamilySettings>;

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
  family: FamilySettings.default({
    handoffAlertTime: "18:00",
    travelBufferMinutes: 15,
    overrunBufferMinutes: 15,
    dutyWindowDays: 30,
  }),
});
export type DashboardSettings = z.infer<typeof DashboardSettings>;

export const DashboardSettingsPatch = DashboardSettings.partial();
export type DashboardSettingsPatch = z.infer<typeof DashboardSettingsPatch>;
