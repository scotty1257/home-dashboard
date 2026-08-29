import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../../platform/database.js";
import { eventHub, Events } from "../../platform/events.js";
import { ToolRegistry } from "./toolRegistry.js";

const ExecuteBody = z.object({
  tool: z.string(),
  arguments: z.record(z.unknown()).default({}),
  /** Set true when the user has confirmed a high-risk action on screen. */
  confirm: z.boolean().default(false),
});

export function voiceActionRoutes(
  app: FastifyInstance,
  db: Database,
  registry: ToolRegistry,
): void {
  app.get("/api/voice/tools", async (_request, reply) => {
    return reply.send({ tools: registry.list() });
  });

  app.post("/api/voice/execute", async (request, reply) => {
    const parsed = ExecuteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid request", details: parsed.error.flatten() });
    }
    const { tool, arguments: args, confirm } = parsed.data;
    const risk = registry.riskOf(tool);
    if (!risk) return reply.status(404).send({ error: `unknown tool: ${tool}` });

    // Sensitive/destructive actions require explicit on-screen confirmation.
    if ((risk === "sensitive" || risk === "destructive") && !confirm) {
      return reply.status(409).send({
        requiresConfirmation: true,
        risk,
        tool,
        arguments: args,
        message: "This action requires confirmation on the dashboard.",
      });
    }

    try {
      const { result } = await registry.execute(tool, args);
      db.prepare(
        `INSERT INTO audit_log (at, actor, action, entity_id, detail)
         VALUES (?, 'voice', ?, ?, ?)`,
      ).run(new Date().toISOString(), tool, String(args.entityId ?? ""), JSON.stringify(args));
      eventHub.emit(Events.voiceTurn, { tool, ok: true });
      return reply.send({ ok: true, result, risk });
    } catch (err) {
      return reply.status(422).send({ ok: false, error: (err as Error).message });
    }
  });
}
