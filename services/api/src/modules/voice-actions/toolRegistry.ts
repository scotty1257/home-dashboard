import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { CalendarRepository } from "../calendar/repository.js";
import type { SpotifyModule } from "../spotify/routes.js";
import type { HomeModule } from "../home/routes.js";
import type { WeatherDeps } from "./weatherDeps.js";

export type Risk = "read-only" | "reversible" | "sensitive" | "destructive";

interface ToolDef {
  name: string;
  description: string;
  risk: Risk;
  parameters: z.ZodTypeAny;
}

export interface VoiceDeps {
  calendar: CalendarRepository;
  spotify: SpotifyModule;
  home: HomeModule;
  weather: WeatherDeps;
}

export class ToolRegistry {
  private tools: ToolDef[] = [];

  constructor(private deps: VoiceDeps) {
    this.tools = [
      {
        name: "get_weather",
        description: "Get the current weather and short forecast.",
        risk: "read-only",
        parameters: z.object({}).default({}),
      },
      {
        name: "query_calendar",
        description: "List calendar events for a relative day range.",
        risk: "read-only",
        parameters: z.object({
          range: z.enum(["today", "tomorrow", "week"]).default("today"),
        }),
      },
      {
        name: "create_event",
        description: "Create a calendar event.",
        risk: "reversible",
        parameters: z.object({
          title: z.string().min(1),
          start: z.string().datetime({ offset: true }),
          end: z.string().datetime({ offset: true }),
          allDay: z.boolean().default(false),
          notes: z.string().optional(),
        }),
      },
      {
        name: "list_home_devices",
        description: "List smart home devices and their current state.",
        risk: "read-only",
        parameters: z.object({ area: z.string().optional() }).default({}),
      },
      {
        name: "home_control",
        description: "Control a smart home device (lights, switches, climate, locks, covers).",
        risk: "sensitive",
        parameters: z.object({
          entityId: z.string(),
          action: z.string(),
          params: z.record(z.unknown()).default({}),
        }),
      },
      {
        name: "media_control",
        description: "Control music playback.",
        risk: "reversible",
        parameters: z.object({
          action: z.enum(["play", "pause", "next", "previous", "setVolume"]),
          volume: z.number().min(0).max(100).optional(),
        }),
      },
    ];
  }

  list(): { name: string; description: string; risk: Risk; parameters: unknown }[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      risk: t.risk,
      parameters: jsonSchema(t.parameters),
    }));
  }

  get(name: string): ToolDef | undefined {
    return this.tools.find((t) => t.name === name);
  }

  riskOf(name: string): Risk | undefined {
    return this.get(name)?.risk;
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; risk: Risk }> {
    const tool = this.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.parameters.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for ${name}: ${parsed.error.message}`);
    }
    const a = parsed.data as Record<string, unknown>;
    const result = await this.dispatch(name, a);
    return { result, risk: tool.risk };
  }

  private async dispatch(name: string, a: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "get_weather":
        return this.deps.weather.getReport();
      case "query_calendar":
        return this.queryCalendar(a.range as string);
      case "create_event":
        return this.deps.calendar.create({
          calendarId: "local",
          title: a.title as string,
          start: a.start as string,
          end: a.end as string,
          allDay: (a.allDay as boolean) ?? false,
          notes: a.notes as string | undefined,
          color: "coral",
          recurrence: { frequency: "none", interval: 1 },
          reminders: [],
        });
      case "list_home_devices": {
        const snapshot = await this.deps.home.getSnapshot();
        const area = a.area as string | undefined;
        const entities = area
          ? snapshot.entities.filter((e) => e.area === area)
          : snapshot.entities;
        return entities.map((e) => ({
          id: e.id,
          name: e.alias ?? e.name,
          state: e.state,
          domain: e.domain,
        }));
      }
      case "home_control":
        await this.deps.home.provider.execute({
          entityId: a.entityId as string,
          action: a.action as string,
          params: (a.params as Record<string, unknown>) ?? {},
        });
        return { ok: true };
      case "media_control": {
        const action = a.action as string;
        if (action === "setVolume") {
          await this.deps.spotify.command({ action: "setVolume", volume: (a.volume as number) ?? 50 });
        } else {
          await this.deps.spotify.command({ action: action as "play" | "pause" | "next" | "previous" });
        }
        return { ok: true };
      }
      default:
        throw new Error(`Unimplemented tool: ${name}`);
    }
  }

  private queryCalendar(range: string): unknown {
    const now = new Date();
    let start = now;
    let end = new Date(now.getTime() + 86_400_000);
    if (range === "week") end = new Date(now.getTime() + 7 * 86_400_000);
    if (range === "tomorrow") {
      start = new Date(now.getTime() + 86_400_000);
      end = new Date(now.getTime() + 2 * 86_400_000);
    }
    const events = this.deps.calendar.list(start.toISOString(), end.toISOString());
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
    }));
  }
}

function jsonSchema(schema: z.ZodType): unknown {
  // Best-effort: zod's internal shape is sufficient for our local LLM tool use.
  try {
    return (schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
  } catch {
    return {};
  }
}
