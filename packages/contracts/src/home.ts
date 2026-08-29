import { z } from "zod";
import { ColorToken, IsoDate } from "./core.js";

export const EntityDomain = z.enum([
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
  "unknown",
]);
export type EntityDomain = z.infer<typeof EntityDomain>;

export const EntityState = z.object({
  id: z.string(), // e.g. "light.living_room"
  domain: EntityDomain,
  name: z.string(),
  area: z.string().optional(),
  /** Human-readable state, e.g. "on", "off", "72 °F", "locked". */
  state: z.string(),
  /** Device attributes relevant for rendering controls. */
  attributes: z.record(z.unknown()).default({}),
  available: z.boolean().default(true),
  /** Dashboard-only overrides (favorite, color, alias, icon). */
  favorite: z.boolean().default(false),
  color: ColorToken.default("slate"),
  alias: z.string().optional(),
  icon: z.string().optional(),
  /** Commands that require on-screen confirmation before executing. */
  requiresConfirmation: z.boolean().default(false),
  updatedAt: IsoDate,
});
export type EntityState = z.infer<typeof EntityState>;

/** A normalized action the API can route to Home Assistant (or the demo provider). */
export const HomeCommand = z.object({
  entityId: z.string(),
  action: z.string(), // e.g. "turn_on", "turn_off", "set_brightness", "set_temperature", "open_cover"
  params: z.record(z.unknown()).default({}),
});
export type HomeCommand = z.infer<typeof HomeCommand>;

export const Scene = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  color: ColorToken.default("violet"),
});
export type Scene = z.infer<typeof Scene>;

export const HomeSnapshot = z.object({
  provider: z.enum(["home-assistant", "demo"]),
  connected: z.boolean(),
  entities: z.array(EntityState),
  scenes: z.array(Scene),
  areas: z.array(z.string()),
  updatedAt: IsoDate,
});
export type HomeSnapshot = z.infer<typeof HomeSnapshot>;
