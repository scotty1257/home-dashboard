import { z } from "zod";

/** A shared UTC timestamp string (ISO 8601). */
export const IsoDate = z.string().datetime({ offset: true });
export type IsoDate = z.infer<typeof IsoDate>;

/** Named color used across cards, calendars, and entities. */
export const ColorToken = z.enum([
  "coral",
  "amber",
  "lime",
  "teal",
  "sky",
  "indigo",
  "violet",
  "rose",
  "slate",
]);
export type ColorToken = z.infer<typeof ColorToken>;

/** Service health snapshot. */
export const HealthStatus = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded", "down"]),
  detail: z.string().optional(),
  checkedAt: IsoDate,
});
export type HealthStatus = z.infer<typeof HealthStatus>;

export const HealthReport = z.object({
  services: z.array(HealthStatus),
});
export type HealthReport = z.infer<typeof HealthReport>;
