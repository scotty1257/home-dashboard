import type { FastifyInstance } from "fastify";
import type { ActivityFeed, ActivityItem } from "@home-dashboard/contracts";
import type { CalendarRepository } from "../calendar/repository.js";
import type { SpotifyModule } from "../spotify/routes.js";
import type { HomeModule } from "../home/routes.js";

export interface ActivityDeps {
  calendar: CalendarRepository;
  spotify: SpotifyModule;
  home: HomeModule;
}

function upcomingEvents(repo: CalendarRepository, now: Date): ActivityItem[] {
  const start = now.toISOString();
  const end = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const events = repo.list(start, end).filter((e) => new Date(e.start).getTime() >= now.getTime());
  return events.slice(0, 6).map((e) => ({
    id: `evt-${e.id}`,
    kind: "event-upcoming" as const,
    title: e.title,
    subtitle: formatWhen(e.start, e.allDay),
    at: e.start,
    ref: e.id,
    severity: "info" as const,
  }));
}

function formatWhen(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function buildActivityFeed(deps: ActivityDeps): Promise<ActivityFeed> {
  const now = new Date();
  const items: ActivityItem[] = [];

  // Ongoing calendar events (happening now)
  const ongoing = deps.calendar
    .list(now.toISOString(), new Date(now.getTime() + 60_000).toISOString())
    .filter((e) => new Date(e.start) <= now && new Date(e.end) > now);
  for (const e of ongoing.slice(0, 2)) {
    items.push({
      id: `now-${e.id}`,
      kind: "event-now",
      title: e.title,
      subtitle: "Happening now",
      at: e.start,
      ref: e.id,
      severity: "notice",
    });
  }

  // Media now playing
  const media = await deps.spotify.state();
  if (media.isPlaying && media.track) {
    items.push({
      id: "media-now",
      kind: "media",
      title: media.track.name,
      subtitle: `${media.track.artists.join(", ")} — playing now`,
      at: now.toISOString(),
      severity: "info",
    });
  }

  // Noteworthy home states: open covers, unlocked locks, active devices
  const home = await deps.home.getSnapshot();
  const flagged = home.entities.filter((e) => {
    if (e.domain === "cover") return e.state === "open" || e.state === "opening";
    if (e.domain === "lock") return e.state === "unlocked" || e.state === "unlocking";
    if (e.domain === "binary_sensor" && e.attributes?.device_class === "garage_door")
      return e.state === "on";
    return false;
  });
  for (const e of flagged.slice(0, 4)) {
    items.push({
      id: `home-${e.id}`,
      kind: "device",
      title: e.alias ?? e.name,
      subtitle: e.state === "open" || e.state === "unlocked" ? "Open / unsecured" : e.state,
      at: e.updatedAt,
      ref: e.id,
      severity: "warning",
    });
  }

  // Upcoming calendar events
  items.push(...upcomingEvents(deps.calendar, now));

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return { items, updatedAt: now.toISOString() };
}

export function activityRoutes(app: FastifyInstance, deps: ActivityDeps): void {
  app.get("/api/activity", async (_request, reply) => {
    const feed = await buildActivityFeed(deps);
    return reply.send(feed);
  });
}
