import { z } from "zod";
import { IsoDate } from "./core";

/** HH:MM, 24-hour local time. */
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** YYYY-MM-DD local service date. */
const SERVICE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Step icons the launch screen can render with Lucide. */
export const LaunchIconKey = z.enum([
  "shoes",
  "bag",
  "snack",
  "water",
  "jacket",
  "toilet",
  "custom",
]);
export type LaunchIconKey = z.infer<typeof LaunchIconKey>;

/** A child's morning/outing launch template. */
export const LaunchTemplate = z.object({
  id: z.string(),
  childId: z.string(),
  name: z.string().min(1),
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  departureLocalTime: z.string().regex(LOCAL_TIME),
  activeWindowMinutes: z.number().int().min(5).max(120).default(45),
  chimeBeforeMinutes: z.number().int().min(1).max(30).default(3),
  active: z.boolean(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type LaunchTemplate = z.infer<typeof LaunchTemplate>;

/** A single checklist step within a template. */
export const LaunchStep = z.object({
  id: z.string(),
  templateId: z.string(),
  label: z.string().min(1),
  icon: LaunchIconKey,
  sortOrder: z.number().int().min(0),
  active: z.boolean(),
});
export type LaunchStep = z.infer<typeof LaunchStep>;

/** Step payload when creating a template with its steps in one call. */
export const LaunchStepInput = z.object({
  label: z.string().min(1),
  icon: LaunchIconKey,
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export type LaunchStepInput = z.input<typeof LaunchStepInput>;

/** A concrete run of a template on one service date. */
export const LaunchRun = z.object({
  id: z.string(),
  templateId: z.string(),
  serviceDate: z.string().regex(SERVICE_DATE),
  departureAt: IsoDate,
  status: z.enum(["active", "complete", "expired"]),
  completedStepIds: z.array(z.string()),
  chimePlayedAt: IsoDate.nullable().optional(),
  completedAt: IsoDate.nullable().optional(),
});
export type LaunchRun = z.infer<typeof LaunchRun>;

export const LaunchTemplateInput = LaunchTemplate.pick({
  childId: true,
  name: true,
  weekdays: true,
  departureLocalTime: true,
  activeWindowMinutes: true,
  chimeBeforeMinutes: true,
  active: true,
}).extend({
  steps: z.array(LaunchStepInput).optional(),
});
export type LaunchTemplateInput = z.input<typeof LaunchTemplateInput>;

export const LaunchToggleStepInput = z.object({
  actorId: z.string(),
  stepId: z.string(),
});
export type LaunchToggleStepInput = z.input<typeof LaunchToggleStepInput>;

/** Kiosk gesture acknowledging the departure chime; actor optional for audit. */
export const LaunchChimePlayedInput = z.object({
  actorId: z.string().optional(),
});
export type LaunchChimePlayedInput = z.input<typeof LaunchChimePlayedInput>;

export const LaunchResetInput = z.object({
  actorId: z.string(),
});
export type LaunchResetInput = z.input<typeof LaunchResetInput>;

/** Current launch state for the kiosk; run is null outside the active window. */
export const LaunchCurrentResponse = z.object({
  run: LaunchRun.nullable(),
  template: LaunchTemplate.nullable(),
  steps: z.array(LaunchStep),
  nowIso: IsoDate,
});
export type LaunchCurrentResponse = z.infer<typeof LaunchCurrentResponse>;
