import type { FastifyInstance } from "fastify";
import type { PlaybackState, SearchResult } from "@home-dashboard/contracts";
import { MediaCommand } from "@home-dashboard/contracts";
import type { Config } from "../../config.js";
import type { Database } from "../../platform/database.js";
import { TtlCache } from "../../platform/cache.js";
import { eventHub, Events } from "../../platform/events.js";
import {
  buildAuthorizeUrl,
  exchangeCode,
  getDevices,
  getPlayback,
  refreshAccessToken,
  sendCommand,
  type SpotifyTokens,
} from "./client.js";

const TOKEN_KEY = "spotify.tokens";

/**
 * Demo cover art as inline SVG data URIs.
 *
 * Demo mode previously shipped no artwork at all, so both players always fell
 * through to the placeholder glyph and you could never see what a real cover
 * looks like in the layout. These are self-contained (no network, no bundled
 * binaries), which matters for a kiosk that has to render offline.
 */
function demoArt(from: string, to: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="s" cx="30%" cy="26%" r="62%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <rect width="640" height="640" fill="url(#s)"/>
  <circle cx="320" cy="320" r="180" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2"/>
  <circle cx="320" cy="320" r="248" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>
  <text x="320" y="352" font-family="Figtree, system-ui, sans-serif" font-size="132"
        font-weight="700" fill="#ffffff" fill-opacity="0.92" text-anchor="middle">${glyph}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_TRACKS = [
  {
    id: "demo-1",
    name: "Golden Hour",
    artists: ["Atlas Bloom"],
    album: "Warm Light",
    durationMs: 232_000,
    artworkUrl: demoArt("#f5a623", "#ff7a5c", "GH"),
  },
  {
    id: "demo-2",
    name: "Neon Skyline",
    artists: ["Cascade"],
    album: "Night Drive",
    durationMs: 254_000,
    artworkUrl: demoArt("#7c8cff", "#b58cff", "NS"),
  },
  {
    id: "demo-3",
    name: "Soft Focus",
    artists: ["The Meridian"],
    album: "Stillness",
    durationMs: 198_000,
    artworkUrl: demoArt("#3fc6b2", "#5db8ff", "SF"),
  },
];

function demoState(): PlaybackState {
  return {
    source: "demo",
    connected: true,
    isPlaying: true,
    track: DEMO_TRACKS[0]!,
    progressMs: 84_000,
    shuffle: false,
    repeat: "off",
    volume: 45,
    devices: [
      { id: "demo-display", name: "This Display", type: "Speaker", isActive: true },
      { id: "demo-kitchen", name: "Kitchen Speaker", type: "Speaker", isActive: false },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export class SpotifyModule {
  private tokens: SpotifyTokens | null = null;
  private demo = demoState();
  private cache = new TtlCache<PlaybackState>();

  constructor(
    private db: Database,
    private config: Config,
  ) {
    this.tokens = this.loadTokens();
  }

  get configured(): boolean {
    return Boolean(this.config.spotify.clientId && this.config.spotify.clientSecret);
  }

  get authorized(): boolean {
    return this.tokens !== null;
  }

  private loadTokens(): SpotifyTokens | null {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(TOKEN_KEY) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as SpotifyTokens;
    } catch {
      return null;
    }
  }

  private saveTokens(tokens: SpotifyTokens): void {
    this.tokens = tokens;
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(TOKEN_KEY, JSON.stringify(tokens), new Date().toISOString());
  }

  authorizeUrl(): string | null {
    if (!this.configured) return null;
    return buildAuthorizeUrl(this.config.spotify.clientId, this.config.spotify.redirectUri);
  }

  async handleCallback(code: string): Promise<void> {
    const tokens = await exchangeCode(
      this.config.spotify.clientId,
      this.config.spotify.clientSecret,
      this.config.spotify.redirectUri,
      code,
    );
    this.saveTokens(tokens);
    this.cache.delete("spotify");
    eventHub.emit(Events.mediaStateChanged, { authorized: true });
  }

  private async ensureToken(): Promise<string> {
    if (!this.tokens) throw new Error("not_authorized");
    if (this.tokens.expiresAt > Date.now() + 30_000) return this.tokens.accessToken;
    const refreshed = await refreshAccessToken(
      this.config.spotify.clientId,
      this.config.spotify.clientSecret,
      this.tokens.refreshToken,
    );
    this.saveTokens(refreshed);
    return refreshed.accessToken;
  }

  async state(force = false): Promise<PlaybackState> {
    if (!this.configured || !this.authorized) {
      const cached = this.cache.get("spotify");
      if (cached) return cached;
      return this.demo;
    }
    const cached = this.cache.get("spotify");
    if (cached && !force) return cached;
    try {
      const token = await this.ensureToken();
      const [playback, devices] = await Promise.all([getPlayback(token), getDevices(token)]);
      const state = { ...playback, devices };
      this.cache.set("spotify", state, 5000);
      return state;
    } catch (err) {
      const stale = this.cache.getStale("spotify");
      if (stale) return stale;
      return { ...this.demo, source: "spotify", connected: false };
    }
  }

  async command(cmd: MediaCommand): Promise<void> {
    if (!this.configured || !this.authorized) {
      this.applyDemo(cmd);
      eventHub.emit(Events.mediaStateChanged, { demo: true });
      return;
    }
    const token = await this.ensureToken();
    const action = cmd.action;
    const payload: Record<string, unknown> = {};
    if (action === "seek") payload.positionMs = cmd.positionMs;
    if (action === "setVolume") payload.volume = cmd.volume;
    if (action === "setShuffle") payload.enabled = cmd.enabled;
    if (action === "setRepeat") payload.mode = cmd.mode;
    if (action === "transfer") payload.deviceId = cmd.deviceId;
    await sendCommand(token, action, payload);
    this.cache.delete("spotify");
    eventHub.emit(Events.mediaStateChanged, { command: action });
  }

  private applyDemo(cmd: MediaCommand): void {
    const d = this.demo;
    switch (cmd.action) {
      case "play":
        d.isPlaying = true;
        break;
      case "pause":
        d.isPlaying = false;
        break;
      case "next":
        d.track = DEMO_TRACKS[(DEMO_TRACKS.indexOf(d.track as (typeof DEMO_TRACKS)[number]) + 1) % DEMO_TRACKS.length]!;
        d.progressMs = 0;
        break;
      case "previous":
        d.track = DEMO_TRACKS[(DEMO_TRACKS.indexOf(d.track as (typeof DEMO_TRACKS)[number]) + DEMO_TRACKS.length - 1) % DEMO_TRACKS.length]!;
        d.progressMs = 0;
        break;
      case "seek":
        d.progressMs = cmd.positionMs;
        break;
      case "setVolume":
        d.volume = cmd.volume;
        break;
      case "setShuffle":
        d.shuffle = cmd.enabled;
        break;
      case "setRepeat":
        d.repeat = cmd.mode;
        break;
      case "transfer":
        d.devices = d.devices.map((dev) => ({ ...dev, isActive: dev.id === cmd.deviceId }));
        break;
    }
    d.updatedAt = new Date().toISOString();
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.configured || !this.authorized) {
      return [
        { id: "demo-s1", kind: "track", name: query, subtitle: "Demo result", artworkUrl: undefined },
        { id: "demo-s2", kind: "album", name: `${query} — Album`, subtitle: "Demo album" },
      ];
    }
    const token = await this.ensureToken();
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,album,artist&limit=12`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`Spotify search ${res.status}`);
    const data = (await res.json()) as {
      tracks?: { items: { id: string; name: string; album: { name: string; images: { url: string }[] }; artists: { name: string }[] }[] };
      albums?: { items: { id: string; name: string; artists: { name: string }[]; images: { url: string }[] }[] };
    };
    const out: SearchResult[] = [];
    for (const t of data.tracks?.items ?? []) {
      out.push({
        id: t.id,
        kind: "track",
        name: t.name,
        subtitle: t.artists.map((a) => a.name).join(", "),
        artworkUrl: t.album.images[0]?.url,
      });
    }
    for (const a of data.albums?.items ?? []) {
      out.push({
        id: a.id,
        kind: "album",
        name: a.name,
        subtitle: a.artists.map((x) => x.name).join(", "),
        artworkUrl: a.images[0]?.url,
      });
    }
    return out;
  }
}

export function spotifyRoutes(app: FastifyInstance, mod: SpotifyModule): void {
  app.get("/api/spotify/state", async (request, reply) => {
    const { refresh } = request.query as { refresh?: string };
    return reply.send(await mod.state(refresh === "1"));
  });

  app.post("/api/spotify/command", async (request, reply) => {
    const parsed = MediaCommand.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid command", details: parsed.error.flatten() });
    }
    try {
      await mod.command(parsed.data);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(502).send({ error: (err as Error).message });
    }
  });

  app.get("/api/spotify/search", async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q) return reply.send([]);
    return reply.send(await mod.search(q));
  });

  app.get("/api/spotify/auth", async (_request, reply) => {
    const url = mod.authorizeUrl();
    if (!url) return reply.status(400).send({ error: "spotify not configured" });
    return reply.redirect(url);
  });

  app.get("/api/spotify/callback", async (request, reply) => {
    const { code, error } = request.query as { code?: string; error?: string };
    if (error || !code) return reply.redirect("/#/media?auth=error");
    try {
      await mod.handleCallback(code);
      return reply.redirect("/#/media?auth=ok");
    } catch {
      return reply.redirect("/#/media?auth=error");
    }
  });

  app.get("/api/spotify/status", async (_request, reply) => {
    return reply.send({
      configured: mod.configured,
      authorized: mod.authorized,
      authorizeUrl: mod.authorizeUrl(),
    });
  });
}
