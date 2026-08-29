import { z } from "zod";
import { IsoDate } from "./core";
import { HouseholdMember } from "./household";

/** A trusted non-household adult who can be asked for backup. */
export const BackupContact = z.object({
  id: z.string(),
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(1),
  priority: z.number().int().min(1),
  active: z.boolean(),
  notes: z.string().optional(),
});
export type BackupContact = z.infer<typeof BackupContact>;

export const BackupContactInput = BackupContact.pick({
  name: true,
  relationship: true,
  phone: true,
  priority: true,
  active: true,
  notes: true,
});
export type BackupContactInput = z.input<typeof BackupContactInput>;

export const HandoffStatus = z.enum([
  "unclaimed",
  "claimed",
  "backup-requested",
  "resolved",
]);
export type HandoffStatus = z.infer<typeof HandoffStatus>;

/** A stored obligation to cover a child-facing event. */
export const HandoffObligation = z.object({
  id: z.string(),
  eventId: z.string(),
  startsAt: IsoDate,
  endsAt: IsoDate,
  status: HandoffStatus,
  assigneeMemberId: z.string().optional(),
  backupContactId: z.string().optional(),
  note: z.string().optional(),
  updatedBy: z.string(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type HandoffObligation = z.infer<typeof HandoffObligation>;

export const HandoffCreateInput = z.object({
  eventId: z.string(),
  startsAt: IsoDate,
  endsAt: IsoDate,
  actorId: z.string(),
});
export type HandoffCreateInput = z.input<typeof HandoffCreateInput>;

/** Per-adult availability for an obligation window, with conflicting events. */
export const AdultAvailability = z.object({
  memberId: z.string(),
  state: z.enum(["available", "conflict"]),
  conflicts: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      start: IsoDate,
      end: IsoDate,
    }),
  ),
});
export type AdultAvailability = z.infer<typeof AdultAvailability>;

/**
 * A board row: the obligation plus the derived context the UI renders
 * (child, event summary, adult availability, and a human conflict reason).
 */
export const HandoffBoardItem = HandoffObligation.extend({
  child: HouseholdMember.nullable(),
  eventSummary: z
    .object({
      id: z.string(),
      title: z.string(),
      start: IsoDate,
      end: IsoDate,
      allDay: z.boolean(),
    })
    .nullable(),
  assignee: HouseholdMember.nullable().optional(),
  backupContact: BackupContact.nullable().optional(),
  attentionState: z.enum(["planned", "night-before", "urgent", "resolved"]),
  availability: z.array(AdultAvailability),
  recommendedMemberId: z.string().nullable().optional(),
  /** e.g. "Pickup at 4:15 PM conflicts with Your call at 4:00 PM". */
  conflictReason: z.string().nullable().optional(),
});
export type HandoffBoardItem = z.infer<typeof HandoffBoardItem>;

export const HandoffBoardResponse = z.object({
  items: z.array(HandoffBoardItem),
  from: IsoDate,
  to: IsoDate,
});
export type HandoffBoardResponse = z.infer<typeof HandoffBoardResponse>;

export const HandoffClaimInput = z.object({
  actorId: z.string(),
});
export type HandoffClaimInput = z.input<typeof HandoffClaimInput>;

export const HandoffResolveInput = z.object({
  actorId: z.string(),
});
export type HandoffResolveInput = z.input<typeof HandoffResolveInput>;

export const HandoffBackupInput = z.object({
  actorId: z.string(),
  backupContactId: z.string().optional(),
  note: z.string().optional(),
});
export type HandoffBackupInput = z.input<typeof HandoffBackupInput>;
