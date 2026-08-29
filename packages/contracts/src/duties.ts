import { z } from "zod";
import { ColorToken, IsoDate } from "./core";

/** Duty icons the duty board can render. */
export const DutyIconKey = z.enum([
  "bedtime",
  "school-run",
  "dentist",
  "permission-slip",
  "night-wake",
  "trash",
  "dishes",
  "laundry",
  "custom",
]);
export type DutyIconKey = z.infer<typeof DutyIconKey>;

/** A recurring duty the family tracks. */
export const DutyDefinition = z.object({
  id: z.string(),
  name: z.string().min(1),
  icon: DutyIconKey,
  color: ColorToken,
  sortOrder: z.number().int().min(0),
  active: z.boolean(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type DutyDefinition = z.infer<typeof DutyDefinition>;

export const DutyDefinitionInput = DutyDefinition.pick({
  name: true,
  icon: true,
  color: true,
  sortOrder: true,
  active: true,
});
export type DutyDefinitionInput = z.input<typeof DutyDefinitionInput>;

/** One logged performance of a duty. */
export const DutyEntry = z.object({
  id: z.string(),
  dutyId: z.string(),
  /** Member id of the performer (the acting member). */
  performedBy: z.string(),
  occurredAt: IsoDate,
  note: z.string().optional(),
  createdAt: IsoDate,
});
export type DutyEntry = z.infer<typeof DutyEntry>;

export const DutyEntryInput = z.object({
  dutyId: z.string(),
  performedBy: z.string(),
  note: z.string().optional(),
});
export type DutyEntryInput = z.input<typeof DutyEntryInput>;

/** An entry enriched with display names for the rollup view. */
export const DutyEntryView = DutyEntry.extend({
  dutyName: z.string(),
  performerName: z.string(),
});
export type DutyEntryView = z.infer<typeof DutyEntryView>;

/** Consecutive-occurrence streak holder within the summary window. */
export const DutyStreak = z.object({
  memberId: z.string(),
  displayName: z.string(),
  count: z.number().int().min(0),
});
export type DutyStreak = z.infer<typeof DutyStreak>;

/** Per-duty tally inside a summary window. */
export const DutyTally = z.object({
  dutyId: z.string(),
  name: z.string(),
  icon: DutyIconKey,
  color: ColorToken,
  counts: z.array(
    z.object({
      memberId: z.string(),
      displayName: z.string(),
      count: z.number().int().min(0),
    }),
  ),
  mostRecentMemberId: z.string().nullable(),
  mostRecentAt: IsoDate.nullable(),
  streak: DutyStreak.nullable(),
});
export type DutyTally = z.infer<typeof DutyTally>;

export const DutySummary = z.object({
  windowStart: IsoDate,
  windowEnd: IsoDate,
  duties: z.array(DutyTally),
  recentEntries: z.array(DutyEntryView),
});
export type DutySummary = z.infer<typeof DutySummary>;

export const DutyWindowQuery = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});
export type DutyWindowQuery = z.infer<typeof DutyWindowQuery>;
