import type { PlaybackState } from "@home-dashboard/contracts";

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface SpotifyPlaybackResponse {
  is_playing: boolean;
  progress_ms: number;
  device: { id: string; name: string; type: string; is_active: boolean } | null;
  shuffle_state: boolean;
  repeat_state: "off" | "context" | "track";
  item: {
    id: string;
    name: string;
    duration_ms: number;
    album: { name: string; images: { url: string }[] };
    artists: { name: string }[];
  } | null;
}

interface SpotifyDevicesResponse {
  devices: { id: string; name: string; type: string; is_active: boolean }[];
}

const BASE = "https://api.spotify.com/v1";

export function buildAuthorizeUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "user-read-playback-position",
    ].join(" "),
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<SpotifyTokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Spotify token exchange ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<SpotifyTokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Spotify refresh ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getPlayback(accessToken: string): Promise<PlaybackState> {
  const res = await fetch(`${BASE}/me/player`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 204) {
    // Nothing currently playing.
    return emptyState();
  }
  if (!res.ok) throw new Error(`Spotify playback ${res.status}`);
  const p = (await res.json()) as SpotifyPlaybackResponse;
  return {
    source: "spotify",
    connected: true,
    isPlaying: p.is_playing,
    track: p.item
      ? {
          id: p.item.id,
          name: p.item.name,
          artists: p.item.artists.map((a) => a.name),
          album: p.item.album.name,
          artworkUrl: p.item.album.images[0]?.url,
          durationMs: p.item.duration_ms,
        }
      : null,
    progressMs: p.progress_ms ?? 0,
    shuffle: p.shuffle_state,
    repeat: p.repeat_state,
    volume: 50,
    devices: [],
    updatedAt: new Date().toISOString(),
  };
}

function emptyState(): PlaybackState {
  return {
    source: "spotify",
    connected: true,
    isPlaying: false,
    track: null,
    progressMs: 0,
    shuffle: false,
    repeat: "off",
    volume: 50,
    devices: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getDevices(accessToken: string): Promise<PlaybackState["devices"]> {
  const res = await fetch(`${BASE}/me/player/devices`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Spotify devices ${res.status}`);
  const data = (await res.json()) as SpotifyDevicesResponse;
  return data.devices.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    isActive: d.is_active,
  }));
}

export async function sendCommand(
  accessToken: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const endpoints: Record<string, { path: string; method: string; body?: unknown }> = {
    play: { path: "/me/player/play", method: "PUT" },
    pause: { path: "/me/player/pause", method: "PUT" },
    next: { path: "/me/player/next", method: "POST" },
    previous: { path: "/me/player/previous", method: "POST" },
    seek: { path: `/me/player/seek?position_ms=${payload.positionMs}`, method: "PUT" },
    setVolume: { path: `/me/player/volume?volume_percent=${payload.volume}`, method: "PUT" },
    setShuffle: { path: `/me/player/shuffle?state=${payload.enabled}`, method: "PUT" },
    setRepeat: { path: `/me/player/repeat?state=${payload.mode}`, method: "PUT" },
    transfer: { path: "/me/player", method: "PUT", body: { device_ids: [payload.deviceId] } },
  };
  const ep = endpoints[action];
  if (!ep) throw new Error(`Unknown command: ${action}`);
  await fetch(`${BASE}${ep.path}`, {
    method: ep.method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: ep.body ? JSON.stringify(ep.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}
