import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HouseholdListResponse, HouseholdMemberInput } from "@home-dashboard/contracts";
import { eventHub, Events } from "../../platform/events.js";
import { HouseholdRepository, RoleError } from "./repository.js";

/** PATCH body: editable member fields plus the acting member id. */
const HouseholdPatchInput = HouseholdMemberInput.extend({ actorId: z.string() });

export function householdRoutes(app: FastifyInstance, repo: HouseholdRepository): void {
  app.get("/api/household", async (_request, reply) => {
    const members = repo.list();
    const body: HouseholdListResponse = { members };
    return reply.send(body);
  });

  app.patch("/api/household/members/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = HouseholdPatchInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid member", details: parsed.error.flatten() });
    }
    const { actorId, ...input } = parsed.data;

    try {
      repo.assertAdult(actorId);
    } catch (err) {
      if (err instanceof RoleError) {
        return reply.status(403).send({ error: "adult role required" });
      }
      throw err;
    }

    const member = repo.update(id, input, actorId);
    if (!member) return reply.status(404).send({ error: "not found" });

    eventHub.emit(Events.householdChanged, { action: "updated", memberId: member.id });
    return reply.send(member);
  });
}
