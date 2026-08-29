import type { FastifyInstance } from "fastify";
import {
  PermissionDecisionInput,
  PermissionReopenInput,
  PermissionRequestInput,
  PermissionRuleInput,
} from "@home-dashboard/contracts";
import { ConflictError } from "../handoffs/repository.js";
import { RoleError } from "../household/repository.js";
import type { PermissionRepository } from "./repository.js";

/**
 * Permission queue + standing rules HTTP surface.
 *
 * Kids may create requests (and rules may auto-decide them on the spot), but
 * only adults can decide, reopen, or manage rules. RoleError → 403, a
 * decided/expired request → 409 with the specific conflict message, unknown
 * ids → 404, invalid bodies → 400 via the shared Zod contracts.
 */
export function permissionRoutes(app: FastifyInstance, repo: PermissionRepository): void {
  app.get("/api/permissions", async (_request, reply) => {
    // Both halves of the queue are always included: pending for the review
    // list, recent (with full decision history) for context.
    return reply.send(repo.queue());
  });

  app.post("/api/permissions", async (request, reply) => {
    const parsed = PermissionRequestInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid permission request", details: parsed.error.flatten() });
    }
    const created = repo.create(parsed.data);
    return reply.status(201).send(created);
  });

  app.post("/api/permissions/:id/decision", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = PermissionDecisionInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid decision", details: parsed.error.flatten() });
    }
    if (repo.get(id) === undefined) return reply.status(404).send({ error: "not found" });

    try {
      const updated = repo.decide(id, parsed.data);
      return reply.send({ request: updated });
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof ConflictError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/permissions/:id/reopen", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = PermissionReopenInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid reopen", details: parsed.error.flatten() });
    }
    if (repo.get(id) === undefined) return reply.status(404).send({ error: "not found" });

    try {
      const updated = repo.reopen(id, parsed.data);
      return reply.send({ request: updated });
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof ConflictError) return reply.status(409).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/permission-rules", async (_request, reply) => {
    return reply.send({ rules: repo.listRules() });
  });

  app.post("/api/permission-rules", async (request, reply) => {
    const parsed = PermissionRuleInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid rule", details: parsed.error.flatten() });
    }
    try {
      return reply.status(201).send(repo.createRule(parsed.data));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });

  app.put("/api/permission-rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = PermissionRuleInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid rule", details: parsed.error.flatten() });
    }
    try {
      const rule = repo.updateRule(id, parsed.data);
      if (rule === undefined) return reply.status(404).send({ error: "not found" });
      return reply.send(rule);
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });

  app.delete("/api/permission-rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = repo.deleteRule(id);
    if (rule === undefined) return reply.status(404).send({ error: "not found" });
    return reply.send(rule);
  });
}
