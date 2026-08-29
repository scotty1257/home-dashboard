import type { HouseholdMember, HouseholdMemberInput } from "@home-dashboard/contracts";
import type { Database } from "../../platform/database.js";

/**
 * Thrown when an actor is not an active adult member. Routes translate this
 * into HTTP 403 (`adult role required`).
 */
export class RoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleError";
  }
}

interface MemberRow {
  id: string;
  display_name: string;
  role: string;
  color: string;
  icon: string;
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
}

function rowToMember(row: MemberRow): HouseholdMember {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role as HouseholdMember["role"],
    color: row.color as HouseholdMember["color"],
    icon: row.icon as HouseholdMember["icon"],
    sortOrder: row.sort_order,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Household member profiles. Default members are seeded by the family-seeds
 * migration; this repository only reads and writes them. A member's role is
 * fixed after creation — update() touches editable fields only.
 */
export class HouseholdRepository {
  constructor(private db: Database) {}

  list(): HouseholdMember[] {
    const rows = this.db
      .prepare("SELECT * FROM household_members ORDER BY sort_order, display_name")
      .all() as unknown as MemberRow[];
    return rows.map(rowToMember);
  }

  get(id: string): HouseholdMember | undefined {
    const row = this.db
      .prepare("SELECT * FROM household_members WHERE id = ?")
      .get(id) as unknown as MemberRow | undefined;
    return row ? rowToMember(row) : undefined;
  }

  update(id: string, input: HouseholdMemberInput, actorId: string): HouseholdMember | undefined {
    this.assertAdult(actorId);
    const existing = this.get(id);
    if (!existing) return undefined;

    const displayName = input.displayName ?? existing.displayName;
    const color = input.color ?? existing.color;
    const icon = input.icon ?? existing.icon;
    const sortOrder = input.sortOrder ?? existing.sortOrder;
    const active = input.active ?? existing.active;

    this.db
      .prepare(
        `UPDATE household_members
         SET display_name = ?, color = ?, icon = ?, sort_order = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(displayName, color, icon, sortOrder, active ? 1 : 0, new Date().toISOString(), id);

    return this.get(id)!;
  }

  /** Assert the actor is a known, active adult member; otherwise throw RoleError. */
  assertAdult(actorId: string): void {
    const row = this.db
      .prepare("SELECT role, active FROM household_members WHERE id = ?")
      .get(actorId) as unknown as { role: string; active: number } | undefined;
    if (!row || row.active !== 1 || row.role !== "adult") {
      throw new RoleError(`member ${actorId} is not an active adult`);
    }
  }
}
