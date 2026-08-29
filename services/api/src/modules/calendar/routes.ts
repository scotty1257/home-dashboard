import type { FastifyInstance } from "fastify";
import {
  CalendarEventInput,
  CalendarListResponse,
  CalendarRangeQuery,
} from "@home-dashboard/contracts";
import type { CalendarRepository } from "./repository.js";

export function calendarRoutes(app: FastifyInstance, repo: CalendarRepository): void {
  app.get("/api/calendar/events", async (request, reply) => {
    const query = request.query as { start?: string; end?: string };
    const parsed = CalendarRangeQuery.safeParse(query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;
    const events = repo.list(start, end);
    const body: CalendarListResponse = { events, rangeStart: start, rangeEnd: end };
    return reply.send(body);
  });

  app.get("/api/calendar/events/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = repo.get(id);
    if (!event) return reply.status(404).send({ error: "not found" });
    return reply.send(event);
  });

  app.post("/api/calendar/events", async (request, reply) => {
    const parsed = CalendarEventInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid event", details: parsed.error.flatten() });
    }
    const event = repo.create(parsed.data);
    return reply.status(201).send(event);
  });

  app.put("/api/calendar/events/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = CalendarEventInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid event", details: parsed.error.flatten() });
    }
    const event = repo.update(id, parsed.data);
    if (!event) return reply.status(404).send({ error: "not found" });
    return reply.send(event);
  });

  app.delete("/api/calendar/events/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!repo.delete(id)) return reply.status(404).send({ error: "not found" });
    return reply.status(204).send();
  });
}
