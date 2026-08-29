import { z } from "zod";
import { IsoDate } from "./core";

/** HH:MM, 24-hour local time. */
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PermissionCategory = z.enum([
  "sleepover",
  "screen-time",
  "ride",
  "purchase",
  "outing",
  "school",
  "other",
]);
export type PermissionCategory = z.infer<typeof PermissionCategory>;

export const PermissionStatus = z.enum(["pending", "approved", "denied", "expired"]);
export type PermissionStatus = z.infer<typeof PermissionStatus>;

/** A child's request awaiting an adult decision. */
export const PermissionRequest = z.object({
  id: z.string(),
  childId: z.string(),
  category: PermissionCategory,
  question: z.string().min(1),
  occursAt: IsoDate.optional(),
  expiresAt: IsoDate.optional(),
  status: PermissionStatus,
  /** Set when an auto-decision was withheld because rules disagreed. */
  ruleConflict: z.string().nullable().optional(),
  createdBy: z.string(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type PermissionRequest = z.infer<typeof PermissionRequest>;

export const PermissionRequestInput = z.object({
  childId: z.string(),
  category: PermissionCategory,
  question: z.string().min(1),
  occursAt: IsoDate.optional(),
  expiresAt: IsoDate.optional(),
  /** Acting member id (the requester). */
  createdBy: z.string(),
});
export type PermissionRequestInput = z.input<typeof PermissionRequestInput>;

export const PermissionDecision = z
  .object({
    id: z.string(),
    requestId: z.string(),
    outcome: z.enum(["approved", "denied", "reopened"]),
    decidedBy: z.string(),
    decidedAt: IsoDate,
    source: z.enum(["manual", "standing-rule"]),
    ruleId: z.string().optional(),
    note: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source === "standing-rule" && !value.ruleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ruleId"],
        message: "ruleId is required when source is 'standing-rule'",
      });
    }
  });
export type PermissionDecision = z.infer<typeof PermissionDecision>;

export const PermissionDecisionInput = z.object({
  actorId: z.string(),
  outcome: z.enum(["approved", "denied"]),
  note: z.string().optional(),
});
export type PermissionDecisionInput = z.input<typeof PermissionDecisionInput>;

export const PermissionReopenInput = z.object({
  actorId: z.string(),
  reason: z.string().min(1),
});
export type PermissionReopenInput = z.input<typeof PermissionReopenInput>;

/** A standing rule that can auto-approve or auto-deny requests. */
export const PermissionRule = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: PermissionCategory,
  outcome: z.enum(["approved", "denied"]),
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  localStartTime: z.string().regex(LOCAL_TIME).optional(),
  localEndTime: z.string().regex(LOCAL_TIME).optional(),
  activeFrom: IsoDate.optional(),
  activeUntil: IsoDate.optional(),
  priority: z.number().int().min(0),
  active: z.boolean(),
  createdBy: z.string(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type PermissionRule = z.infer<typeof PermissionRule>;

export const PermissionRuleInput = PermissionRule.pick({
  name: true,
  category: true,
  outcome: true,
  weekdays: true,
  localStartTime: true,
  localEndTime: true,
  activeFrom: true,
  activeUntil: true,
  priority: true,
  active: true,
}).extend({
  /** Acting member id, recorded as createdBy by the server. */
  actorId: z.string(),
});
export type PermissionRuleInput = z.input<typeof PermissionRuleInput>;

/** A request with its decision history — reopened requests keep prior decisions. */
export const PermissionRequestWithDecisions = PermissionRequest.extend({
  decisions: z.array(PermissionDecision),
});
export type PermissionRequestWithDecisions = z.infer<typeof PermissionRequestWithDecisions>;

export const PermissionQueueResponse = z.object({
  pending: z.array(PermissionRequest),
  recent: z.array(PermissionRequestWithDecisions),
});
export type PermissionQueueResponse = z.infer<typeof PermissionQueueResponse>;
