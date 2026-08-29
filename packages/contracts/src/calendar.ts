import { z } from "zod";
import { ColorToken, IsoDate } from "./core";

export const RecurrenceRule = z.object({
  frequency: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).default(1),
  /** 0 = Sunday … 6 = Saturday, used when frequency is weekly. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  until: IsoDate.optional(),
});
export type RecurrenceRule = z.infer<typeof RecurrenceRule>;

export const Reminder = z.object({
  /** Minutes before the event start. */
  minutesBefore: z.number().int().min(0),
  delivered: z.boolean().default(false),
});
export type Reminder = z.infer<typeof Reminder>;

export const CalendarEvent = z.object({
  id: z.string(),
  calendarId: z.string().default("local"),
  title: z.string().min(1),
  start: IsoDate,
  end: IsoDate,
  allDay: z.boolean().default(false),
  location: z.string().optional(),
  notes: z.string().optional(),
  color: ColorToken.default("sky"),
  recurrence: RecurrenceRule.default({ frequency: "none", interval: 1 }),
  reminders: z.array(Reminder).default([]),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

/** Fields accepted when creating or updating an event. */
export const CalendarEventInput = CalendarEvent.pick({
  calendarId: true,
  title: true,
  start: true,
  end: true,
  allDay: true,
  location: true,
  notes: true,
  color: true,
  recurrence: true,
  reminders: true,
});
export type CalendarEventInput = z.input<typeof CalendarEventInput>;

/** A calendar range query, all timestamps UTC ISO. */
export const CalendarRangeQuery = z.object({
  start: IsoDate,
  end: IsoDate,
});
export type CalendarRangeQuery = z.infer<typeof CalendarRangeQuery>;

export const CalendarListResponse = z.object({
  events: z.array(CalendarEvent),
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
});
export type CalendarListResponse = z.infer<typeof CalendarListResponse>;
