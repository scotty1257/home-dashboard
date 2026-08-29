import type { EntityState, HomeCommand, HomeSnapshot } from "@home-dashboard/contracts";
import type { HomeProvider } from "./provider.js";

const now = () => new Date().toISOString();

interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
}

function mapDomain(entityId: string): EntityState["domain"] {
  const domain = entityId.split(".")[0] ?? "unknown";
  const known: EntityState["domain"][] = [
    "light",
    "switch",
    "climate",
    "cover",
    "lock",
    "sensor",
    "binary_sensor",
    "fan",
    "media_player",
    "scene",
    "script",
    "button",
    "number",
    "select",
  ];
  return (known as string[]).includes(domain) ? (domain as EntityState["domain"]) : "unknown";
}

/** Maps a Home Assistant entity into the dashboard's normalized contract. */
export function mapHaState(raw: HaState): EntityState {
  const id = raw.entity_id;
  const domain = mapDomain(id);
  const friendly = (raw.attributes.friendly_name as string) ?? id;
  const area = (raw.attributes.area_id as string) ?? undefined;
  const locked = raw.state === "locked" || raw.state === "unlocked" || raw.state === "unlocking" || raw.state === "locking";
  return {
    id,
    domain,
    name: friendly,
    area,
    state: raw.state,
    attributes: raw.attributes,
    available: raw.state !== "unavailable" && raw.state !== "unknown",
    favorite: false,
    color: "slate",
    requiresConfirmation: domain === "lock" || domain === "cover",
    updatedAt: raw.last_changed,
  };
}

/**
 * Home Assistant provider using the REST API with a long-lived access token.
 * WebSocket live streaming can be layered on later; REST polling is sufficient
 * and simple for a single kiosk.
 */
export class HomeAssistantProvider implements HomeProvider {
  readonly name = "home-assistant" as const;

  constructor(
    private url: string,
    private token: string,
    private hiddenDomains: string[] = [],
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Home Assistant ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  }

  async snapshot(): Promise<HomeSnapshot> {
    const states = await this.request<HaState[]>("/api/states");
    const visible = states.filter(
      (s) => !this.hiddenDomains.includes(s.entity_id.split(".")[0] ?? ""),
    );
    const entities = visible
      .filter((s) => !["scene", "automation"].includes(s.entity_id.split(".")[0] ?? ""))
      .map(mapHaState);

    const sceneStates = states.filter((s) => s.entity_id.startsWith("scene."));
    const scenes = sceneStates.map((s) => ({
      id: s.entity_id,
      name: (s.attributes.friendly_name as string) ?? s.entity_id,
      icon: (s.attributes.icon as string) ?? undefined,
      color: "violet" as const,
    }));

    const areas = [...new Set(entities.map((e) => e.area).filter(Boolean))] as string[];

    return {
      provider: "home-assistant",
      connected: true,
      entities,
      scenes,
      areas,
      updatedAt: now(),
    };
  }

  async execute(command: HomeCommand): Promise<void> {
    const [domain, ...rest] = command.entityId.split(".");
    void rest;
    const serviceMap: Record<string, string> = {
      turn_on: "turn_on",
      turn_off: "turn_off",
      toggle: "toggle",
      set_brightness: "turn_on",
      set_temperature: "set_temperature",
      open_cover: "open_cover",
      close_cover: "close_cover",
      lock: "lock",
      unlock: "unlock",
      set_fan_percentage: "set_percentage",
      set_volume: "volume_set",
    };
    const service = serviceMap[command.action] ?? command.action;
    await this.request(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify({ entity_id: command.entityId, ...command.params }),
    });
  }
}
