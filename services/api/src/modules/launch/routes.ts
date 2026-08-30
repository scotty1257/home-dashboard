import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LaunchChimePlayedInput, LaunchTemplateInput } from "@home-dashboard/contracts";
import { ConflictError } from "../handoffs/repository.js";
import { RoleError } from "../household/repository.js";
import { NotFoundError, type LaunchRepository } from "./repository.js";

/** Bodies that name the acting member alongside the payload. */
const ActorBody = z.object({ actorId: z.string().min(1) });
const TemplateInputWithActor = LaunchTemplateInput.extend({ actorId: z.string().min(1) });

/**
 * Launch sequence HTTP surface.
 *
 * `current` accepts an optional `at` instant override so tests (and only
 * tests) can pin the clock; mutations are adults-only where they manage
 * state, and errors map RoleError → 403, NotFoundError → 404,
 * ConflictError → 409, invalid bodies → 400.
 */
export function launchRoutes(app: FastifyInstance, repo: LaunchRepository): void {
  app.get("/api/launch/current", async (request, reply) => {
    const query = (request.query ?? {}) as { at?: string };
    let at: Date | undefined;
    if (query.at !== undefined) {
      const parsed = Date.parse(query.at);
      if (Number.isNaN(parsed)) {
        return reply.status(400).send({ error: "invalid at" });
      }
      at = new Date(parsed);
    }
    return reply.send(repo.current(at));
  });

  app.post("/api/launch/runs/:runId/steps/:stepId/toggle", async (request, reply) => {
    const { runId, stepId } = request.params as { runId: string; stepId: string };
    const parsed = ActorBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid toggle", details: parsed.error.flatten() });
    }
    try {
      return reply.send({ run: repo.toggleStep(runId, stepId, parsed.data.actorId) });
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof NotFoundError) return reply.status(404).send({ error: err.message });
      if (err instanceof ConflictError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/launch/runs/:runId/chime-played", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const parsed = LaunchChimePlayedInput.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid chime ack", details: parsed.error.flatten() });
    }
    try {
      return reply.send({ run: repo.markChimePlayed(runId, parsed.data.actorId) });
    } catch (err) {
      if (err instanceof NotFoundError) return reply.status(404).send({ error: err.message });
      if (err instanceof ConflictError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/launch/runs/:runId/reset", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const parsed = ActorBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid reset", details: parsed.error.flatten() });
    }
    try {
      return reply.send({ run: repo.reset(runId, parsed.data.actorId) });
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof NotFoundError) return reply.status(404).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/launch/templates", async (_request, reply) => {
    return reply.send({ templates: repo.listTemplates() });
  });

  app.post("/api/launch/templates", async (request, reply) => {
    const parsed = TemplateInputWithActor.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid launch template", details: parsed.error.flatten() });
    }
    const { actorId, ...input } = parsed.data;
    try {
      return reply.status(201).send(repo.createTemplate(input, actorId));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });

  app.put("/api/launch/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = TemplateInputWithActor.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid launch template", details: parsed.error.flatten() });
    }
    const { actorId, ...input } = parsed.data;
    try {
      return reply.send(repo.updateTemplate(id, input, actorId));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof NotFoundError) return reply.status(404).send({ error: err.message });
      throw err;
    }
  });
}
