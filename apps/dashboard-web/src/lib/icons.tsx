import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudHail,
  CloudLightning,
  Wind,
  Lightbulb,
  Power,
  Thermometer,
  Blinds,
  Lock,
  Gauge,
  DoorOpen,
  Fan,
  Speaker,
  Clapperboard,
  Zap,
  CircleDot,
  Hash,
  SlidersHorizontal,
  Home,
  type LucideIcon,
} from "lucide-react";

/**
 * Single-color vector icons (Lucide, stroke-based). No emoji anywhere — icons
 * are tinted via `text-*`/`text-ink-*` utilities and inherit the current color.
 */

export const weatherIcon = (condition: string, isDay = true): LucideIcon => {
  switch (condition) {
    case "clear":
      return isDay ? Sun : Moon;
    case "partly-cloudy":
      return isDay ? CloudSun : CloudMoon;
    case "cloudy":
      return Cloud;
    case "fog":
      return CloudFog;
    case "rain":
      return CloudRain;
    case "drizzle":
      return CloudDrizzle;
    case "snow":
      return CloudSnow;
    case "sleet":
      return CloudHail;
    case "thunderstorm":
      return CloudLightning;
    case "windy":
      return Wind;
    default:
      return Cloud;
  }
};

export const domainIcon = (domain: string): LucideIcon => {
  switch (domain) {
    case "light":
      return Lightbulb;
    case "switch":
      return Power;
    case "climate":
      return Thermometer;
    case "cover":
      return Blinds;
    case "lock":
      return Lock;
    case "sensor":
      return Gauge;
    case "binary_sensor":
      return DoorOpen;
    case "fan":
      return Fan;
    case "media_player":
      return Speaker;
    case "scene":
      return Clapperboard;
    case "script":
      return Zap;
    case "button":
      return CircleDot;
    case "number":
      return Hash;
    case "select":
      return SlidersHorizontal;
    default:
      return Home;
  }
};

export type { LucideIcon };

/**
 * Named glyph sizes. Icon sizes had drifted across the app (12/14/16/18/20/24/
 * 26/28/32/36), so a gear in a 56px header button rendered smaller than a tab
 * icon. These are the steps to reach for; the button/tile sets its own box.
 */
export const ICON = {
  /** Inline with metadata text. */
  sm: 18,
  /** Default for controls and buttons. */
  md: 22,
  /** Header actions and primary controls. */
  lg: 26,
  /** Nav tabs and feature glyphs. */
  xl: 30,
} as const;
