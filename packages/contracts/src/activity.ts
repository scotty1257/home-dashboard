import { z } from "zod";
import { IsoDate } from "./core.js";

export const ActivityKind = z.enum([
  "event-now",
  "event-upcoming",
  "media",
  "timer",
  "alert",
  "device",
  "system",
]);
export type ActivityKind = z.infer<typeof ActivityKind>;

export const ActivityItem = z.object({
  id: z.string(),
  kind: ActivityKind,
  title: z.string(),
  subtitle: z.string().optional(),
  /** When the activity is happening; used for ordering. */
  at: IsoDate,
  /** Optional entity/event/media reference. */
  ref: z.string().optional(),
  severity: z.enum(["info", "notice", "warning"]).default("info"),
});
export type ActivityItem = z.infer<typeof ActivityItem>;

export const ActivityFeed = z.object({
  items: z.array(ActivityItem),
  updatedAt: IsoDate,
});
export type ActivityFeed = z.infer<typeof ActivityFeed>;
