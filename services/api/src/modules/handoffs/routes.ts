import type { FastifyInstance } from "fastify";
import {
  BackupContactInput,
  HandoffBackupInput,
  HandoffClaimInput,
  HandoffCreateInput,
  HandoffResolveInput,
  IsoDate,
} from "@home-dashboard/contracts";
import type { HandoffBoardItem, HandoffObligation } from "@home-dashboard/contracts";
import type { HandoffRepository } from "./repository.js";
import { ConflictError, RoleError } from "./repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default board horizon: the next 14 days from now. */
const BOARD_WINDOW_DAYS = 14;

/**
 * Re-fetch the board item for a just-mutated obligation so mutation responses
 * carry the derived context (attention state, availability, conflicts) the UI
 * renders. The obligation always falls inside its own [startsAt, endsAt]
 * window; the fallback is purely defensive.
 */
function boardItemFor(repo: HandoffRepository, obligation: HandoffObligation): HandoffBoardItem {
  return (
    repo.board(obligation.startsAt, obligation.endsAt).items.find((item) => item.id === obligation.id) ?? {
      ...obligation,
      child: null,
      eventSummary: null,
      assignee: null,
      backupContact: null,
      attentionState: "planned",
      availability: [],
      recommendedMemberId: null,
      conflictReason: null,
    }
  );
}

export function handoffRoutes(app: FastifyInstance, repo: HandoffRepository): void {
  app.get("/api/handoffs", async (request, reply) => {
    const query = request.query as { from?: string; to?: string };
    const now = new Date();
    const from = query.from ?? now.toISOString();
    const to = query.to ?? new Date(now.getTime() + BOARD_WINDOW_DAYS * DAY_MS).toISOString();
    if (!IsoDate.safeParse(from).success || !IsoDate.safeParse(to).success) {
      return reply.status(400).send({ error: "invalid range" });
    }
    return reply.send(repo.board(from, to));
  });

  app.post("/api/handoffs", async (request, reply) => {
    const parsed = HandoffCreateInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid handoff", details: parsed.error.flatten() });
    }
    try {
      const obligation = repo.create(parsed.data);
      return reply.status(201).send(boardItemFor(repo, obligation));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      throw err;
    }
  });

  app.patch("/api/handoffs/:id/claim", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = HandoffClaimInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid claim", details: parsed.error.flatten() });
    }
    if (!repo.get(id)) return reply.status(404).send({ error: "not found" });
    try {
      const obligation = repo.claim(id, parsed.data.actorId);
      return reply.send(boardItemFor(repo, obligation));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof ConflictError) return reply.status(409).send({ error: "stale state" });
      throw err;
    }
  });

  app.patch("/api/handoffs/:id/request-backup", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = HandoffBackupInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid backup request", details: parsed.error.flatten() });
    }
    if (!repo.get(id)) return reply.status(404).send({ error: "not found" });
    try {
      const obligation = repo.requestBackup(id, parsed.data);
      return reply.send(boardItemFor(repo, obligation));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof ConflictError) return reply.status(409).send({ error: "stale state" });
      throw err;
    }
  });

  app.patch("/api/handoffs/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = HandoffResolveInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid resolve", details: parsed.error.flatten() });
    }
    if (!repo.get(id)) return reply.status(404).send({ error: "not found" });
    try {
      const obligation = repo.resolve(id, parsed.data.actorId);
      return reply.send(boardItemFor(repo, obligation));
    } catch (err) {
      if (err instanceof RoleError) return reply.status(403).send({ error: "adult role required" });
      if (err instanceof ConflictError) return reply.status(409).send({ error: "stale state" });
      throw err;
    }
  });

  app.get("/api/backup-contacts", async (_request, reply) => {
    return reply.send({ contacts: repo.listContacts() });
  });

  app.post("/api/backup-contacts", async (request, reply) => {
    const parsed = BackupContactInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid contact", details: parsed.error.flatten() });
    }
    return reply.status(201).send(repo.createContact(parsed.data));
  });

  app.put("/api/backup-contacts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = BackupContactInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid contact", details: parsed.error.flatten() });
    }
    const contact = repo.updateContact(id, parsed.data);
    if (!contact) return reply.status(404).send({ error: "not found" });
    return reply.send(contact);
  });
}
