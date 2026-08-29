import { z } from "zod";
import { ColorToken, IsoDate } from "./core";

/** A person in the household. Role is fixed after creation (server-enforced). */
export const HouseholdMember = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  role: z.enum(["adult", "child"]),
  color: ColorToken,
  icon: z.enum(["user", "user-round", "baby", "heart", "star"]),
  sortOrder: z.number().int().min(0),
  active: z.boolean(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type HouseholdMember = z.infer<typeof HouseholdMember>;

/**
 * Editable fields for PATCH /api/household/members/:id. Role is deliberately
 * absent: names, colors, icons, order, and activation are editable, but a
 * member's role never changes after creation. Zod strips unknown keys, so a
 * payload containing `role` is silently reduced to the editable fields.
 */
export const HouseholdMemberInput = HouseholdMember.pick({
  displayName: true,
  color: true,
  icon: true,
  sortOrder: true,
  active: true,
}).partial();
export type HouseholdMemberInput = z.input<typeof HouseholdMemberInput>;

export const HouseholdListResponse = z.object({
  members: z.array(HouseholdMember),
});
export type HouseholdListResponse = z.infer<typeof HouseholdListResponse>;
