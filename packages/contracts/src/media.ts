import { z } from "zod";
import { IsoDate } from "./core.js";

export const MediaSource = z.enum(["spotify", "demo", "none"]);
export type MediaSource = z.infer<typeof MediaSource>;

export const PlaybackState = z.object({
  source: MediaSource,
  connected: z.boolean(),
  isPlaying: z.boolean(),
  track: z
    .object({
      id: z.string(),
      name: z.string(),
      artists: z.array(z.string()),
      album: z.string(),
      artworkUrl: z.string().optional(),
      durationMs: z.number(),
    })
    .nullable(),
  progressMs: z.number(),
  shuffle: z.boolean().default(false),
  repeat: z.enum(["off", "context", "track"]).default("off"),
  volume: z.number().min(0).max(100),
  devices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      isActive: z.boolean(),
    }),
  ),
  updatedAt: IsoDate,
});
export type PlaybackState = z.infer<typeof PlaybackState>;

export const MediaCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("play") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("previous") }),
  z.object({ action: z.literal("seek"), positionMs: z.number().min(0) }),
  z.object({ action: z.literal("setVolume"), volume: z.number().min(0).max(100) }),
  z.object({ action: z.literal("setShuffle"), enabled: z.boolean() }),
  z.object({ action: z.literal("setRepeat"), mode: z.enum(["off", "context", "track"]) }),
  z.object({ action: z.literal("transfer"), deviceId: z.string() }),
]);
export type MediaCommand = z.infer<typeof MediaCommand>;

export const SearchResult = z.object({
  id: z.string(),
  kind: z.enum(["track", "album", "artist", "playlist"]),
  name: z.string(),
  subtitle: z.string(),
  artworkUrl: z.string().optional(),
});
export type SearchResult = z.infer<typeof SearchResult>;
