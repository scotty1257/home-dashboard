import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DutyDefinitionInput, DutyEntryInput, DutyWindowQuery } from "@home-dashboard/contracts";
import { ConflictError } from "../handoffs/repository.js";
import { RoleError } from "../household/repository.js";
import type { DutyRepository } from "./repository.js";

/** Bodies that name the acting member alongside the payload. */
const ActorBody = z.object({ actorId: z.string().min(1) });
const DefinitionInputWithActor = DutyDefinitionInput.extend({ actorId: z.string().min(1) });

/**
 * Duty ledger HTTP surface.
 *
 * Quick-logging credits the performer (adults only — child performers are
 * rejected with 403 before any row is written). Undo is adults-only and
 * conflicts (409) unless the entry is the duty's latest. Definitions are
 * adult-managed. Invalid bodies/windows → 400, unknown ids → 404.
 */
export function dutyRoutes(app: FastifyInstance, repo: DutyRepository): void {
  app.get("/api/duties", async (request, reply) => {
    const parsed = DutyWindowQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid window", details: parsed.error.flatten() });
    }
    return reply.send(repo.summary(parsed.data.windowDays));
  });

  app.post("/api/duties/entries", async (request, reply) => {
    const parsed = DutyEntryInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid duty entry", details: parsed.error.flatten() });
    }
    try {
      return reply.status(201).send(repo.logEntry(parsed.data));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });

  app.delete("/api/duties/entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ActorBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid undo", details: parsed.error.flatten() });
    }
    if (repo.getEntry(id) === undefined) return reply.status(404).send({ error: "not found" });
    try {
      const entry = repo.undoEntry(id, parsed.data.actorId);
      return reply.send({ entry });
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof ConflictError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/duties", async (request, reply) => {
    const parsed = DefinitionInputWithActor.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid duty definition", details: parsed.error.flatten() });
    }
    const { actorId, ...input } = parsed.data;
    try {
      return reply.status(201).send(repo.createDefinition(input, actorId));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });

  app.put("/api/duties/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = DefinitionInputWithActor.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid duty definition", details: parsed.error.flatten() });
    }
    const { actorId, ...input } = parsed.data;
    try {
      const updated = repo.updateDefinition(id, input, actorId);
      if (updated === undefined) return reply.status(404).send({ error: "not found" });
      return reply.send(updated);
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });
}
