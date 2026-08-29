import { describe, it, expect } from "vitest";
import { HouseholdMemberInput } from "@home-dashboard/contracts";
import { Database } from "../../platform/database.js";
import { HouseholdRepository, RoleError } from "./repository.js";

function makeRepo(): HouseholdRepository {
  const db = new Database(":memory:");
  return new HouseholdRepository(db);
}

describe("HouseholdRepository", () => {
  it("lists the seeded members in sort order", () => {
    const repo = makeRepo();
    const members = repo.list();
    expect(members.map((m) => m.displayName)).toEqual(["You", "Partner", "Kid"]);
    expect(members.map((m) => m.id)).toEqual(["member-you", "member-partner", "member-kid"]);
    expect(members.map((m) => m.role)).toEqual(["adult", "adult", "child"]);
  });

  it("gets a member by id", () => {
    const repo = makeRepo();
    expect(repo.get("member-kid")?.displayName).toBe("Kid");
    expect(repo.get("member-ghost")).toBeUndefined();
  });

  it("updates editable fields, bumps updated_at, and never changes role", () => {
    const repo = makeRepo();
    const before = repo.get("member-you");
    expect(before).toBeDefined();

    // The zod input schema strips `role`; even if a body sneaks it through the
    // parse, update() must not write it.
    const input = HouseholdMemberInput.parse({
      displayName: "Scott",
      color: "amber",
      icon: "star",
      role: "child",
    });

    const updated = repo.update("member-you", input, "member-partner");
    expect(updated).toBeDefined();
    expect(updated?.displayName).toBe("Scott");
    expect(updated?.color).toBe("amber");
    expect(updated?.icon).toBe("star");
    expect(updated?.role).toBe("adult");
    expect(updated?.updatedAt).not.toBe(before?.updatedAt);

    // Persisted state agrees.
    expect(repo.get("member-you")?.role).toBe("adult");
    expect(repo.get("member-you")?.displayName).toBe("Scott");
  });

  it("returns undefined when updating an unknown member", () => {
    const repo = makeRepo();
    const updated = repo.update("member-ghost", { displayName: "Nope" }, "member-you");
    expect(updated).toBeUndefined();
  });

  it("assertAdult passes for adults and throws for children or unknown ids", () => {
    const repo = makeRepo();
    expect(() => repo.assertAdult("member-you")).not.toThrow();
    expect(() => repo.assertAdult("member-partner")).not.toThrow();
    expect(() => repo.assertAdult("member-kid")).toThrow(RoleError);
    expect(() => repo.assertAdult("member-ghost")).toThrow(RoleError);
  });
});
