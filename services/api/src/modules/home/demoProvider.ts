import type { EntityState, HomeCommand, HomeSnapshot } from "@home-dashboard/contracts";
import type { HomeProvider } from "./provider.js";

const now = () => new Date().toISOString();

function entity(
  id: string,
  domain: EntityState["domain"],
  name: string,
  area: string,
  state: string,
  attributes: Record<string, unknown> = {},
  extra: Partial<EntityState> = {},
): EntityState {
  return {
    id,
    domain,
    name,
    area,
    state,
    attributes,
    available: true,
    favorite: false,
    color: "slate",
    requiresConfirmation: false,
    updatedAt: now(),
    ...extra,
  };
}

/**
 * Demo provider: a realistic in-memory smart home that responds to commands,
 * so the dashboard is fully usable without Home Assistant configured.
 */
export class DemoHomeProvider implements HomeProvider {
  readonly name = "demo" as const;

  private entities: Record<string, EntityState> = {
    "light.living_room": entity("light.living_room", "light", "Living Room", "Living Room", "on", { brightness: 255, color_temp: 3200 }, { favorite: true, color: "amber" }),
    "light.kitchen": entity("light.kitchen", "light", "Kitchen", "Kitchen", "on", { brightness: 180, color_temp: 4000 }, { favorite: true, color: "lime" }),
    "light.bedroom": entity("light.bedroom", "light", "Bedroom", "Bedroom", "off", { brightness: 0 }, { color: "violet" }),
    "light.office": entity("light.office", "light", "Office", "Office", "on", { brightness: 120, rgb_color: [255, 160, 90] }, { color: "coral" }),
    "climate.thermostat": entity("climate.thermostat", "climate", "Thermostat", "Living Room", "heat", { current_temperature: 71, temperature: 72, hvac_modes: ["off", "heat", "cool"] }, { favorite: true, color: "teal" }),
    "cover.front_door_shade": entity("cover.front_door_shade", "cover", "Front Shade", "Entryway", "open", { current_position: 100 }, { color: "sky" }),
    "lock.front_door": entity("lock.front_door", "lock", "Front Door", "Entryway", "locked", {}, { requiresConfirmation: true, color: "rose" }),
    "switch.coffee": entity("switch.coffee", "switch", "Coffee Maker", "Kitchen", "off", {}, { color: "amber" }),
    "fan.bedroom": entity("fan.bedroom", "fan", "Bedroom Fan", "Bedroom", "off", { percentage: 0 }, { color: "indigo" }),
    "sensor.living_temp": entity("sensor.living_temp", "sensor", "Living Room Temp", "Living Room", "71.2", { unit_of_measurement: "°F", device_class: "temperature" }),
    "sensor.outdoor_humidity": entity("sensor.outdoor_humidity", "sensor", "Outdoor Humidity", "Exterior", "54", { unit_of_measurement: "%", device_class: "humidity" }),
    "binary_sensor.garage_door": entity("binary_sensor.garage_door", "binary_sensor", "Garage Door", "Garage", "off", { device_class: "garage_door" }),
    "media_player.living_speaker": entity("media_player.living_speaker", "media_player", "Living Speaker", "Living Room", "playing", { volume_level: 0.4 }, { favorite: true, color: "sky" }),
  };

  private scenes = [
    { id: "scene.movie_night", name: "Movie Night", icon: "🎬", color: "indigo" as const },
    { id: "scene.good_morning", name: "Good Morning", icon: "🌅", color: "amber" as const },
    { id: "scene.away", name: "Away", icon: "🏠", color: "slate" as const },
    { id: "scene.sleep", name: "Sleep", icon: "🌙", color: "violet" as const },
  ];

  async snapshot(): Promise<HomeSnapshot> {
    return {
      provider: "demo",
      connected: true,
      entities: Object.values(this.entities),
      scenes: this.scenes,
      areas: [...new Set(Object.values(this.entities).map((e) => e.area).filter(Boolean))] as string[],
      updatedAt: now(),
    };
  }

  async execute(command: HomeCommand): Promise<void> {
    const ent = this.entities[command.entityId];
    if (!ent) throw new Error(`Unknown entity: ${command.entityId}`);

    switch (command.action) {
      case "turn_on":
        ent.state = "on";
        break;
      case "turn_off":
        ent.state = "off";
        if (ent.domain === "light") ent.attributes = { ...ent.attributes, brightness: 0 };
        break;
      case "toggle":
        ent.state = ent.state === "on" ? "off" : "on";
        break;
      case "set_brightness":
        ent.state = Number(command.params.brightness) > 0 ? "on" : "off";
        ent.attributes = { ...ent.attributes, brightness: command.params.brightness };
        break;
      case "set_temperature":
        ent.state = command.params.hvac_mode === "off" ? "off" : String(command.params.hvac_mode ?? "heat");
        ent.attributes = { ...ent.attributes, temperature: command.params.temperature };
        break;
      case "open_cover":
        ent.state = "open";
        ent.attributes = { ...ent.attributes, current_position: 100 };
        break;
      case "close_cover":
        ent.state = "closed";
        ent.attributes = { ...ent.attributes, current_position: 0 };
        break;
      case "lock":
        ent.state = "locked";
        break;
      case "unlock":
        ent.state = "unlocked";
        break;
      case "set_fan_percentage":
        ent.state = Number(command.params.percentage) > 0 ? "on" : "off";
        ent.attributes = { ...ent.attributes, percentage: command.params.percentage };
        break;
      case "set_volume":
        ent.state = Number(command.params.volume_level) > 0 ? "playing" : "idle";
        ent.attributes = { ...ent.attributes, volume_level: command.params.volume_level };
        break;
      default:
        throw new Error(`Unsupported action: ${command.action}`);
    }
    ent.updatedAt = now();
  }
}
