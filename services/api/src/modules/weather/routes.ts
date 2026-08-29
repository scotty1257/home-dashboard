import type { FastifyInstance } from "fastify";
import type { WeatherDeps } from "../voice-actions/weatherDeps.js";

export function weatherRoutes(app: FastifyInstance, deps: WeatherDeps): void {
  app.get("/api/weather", async (request, reply) => {
    const { refresh } = request.query as { refresh?: string };
    const report = await deps.getReport(refresh === "1");
    return reply.send(report);
  });
}
