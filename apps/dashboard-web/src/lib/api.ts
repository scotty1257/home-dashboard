import type {
  ActivityFeed,
  CalendarEvent,
  CalendarEventInput,
  CalendarListResponse,
  DashboardSettings,
  DashboardSettingsPatch,
  EntityState,
  HomeCommand,
  HomeSnapshot,
  HouseholdListResponse,
  HouseholdMember,
  HouseholdMemberInput,
  MediaCommand,
  PlaybackState,
  SearchResult,
  WeatherReport,
} from "@home-dashboard/contracts";

/**
 * Thin typed fetch client. In dev, Vite proxies /api and /voice to the
 * services; in production, nginx serves everything on one origin.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

export const api = {
  // Health
  health: () => request<{ services: { service: string; status: string; detail?: string }[] }>("/api/health"),

  // Calendar
  calendar: {
    list: (start: string, end: string) =>
      request<CalendarListResponse>(`/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
    create: (input: CalendarEventInput) =>
      request<CalendarEvent>("/api/calendar/events", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: CalendarEventInput) =>
      request<CalendarEvent>(`/api/calendar/events/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    remove: (id: string) =>
      request<void>(`/api/calendar/events/${id}`, { method: "DELETE" }),
  },

  // Weather
  weather: () => request<WeatherReport>("/api/weather"),

  // Home
  home: () => request<HomeSnapshot>("/api/home"),
  homeCommand: (command: HomeCommand) =>
    request<{ ok: boolean }>("/api/home/command", { method: "POST", body: JSON.stringify(command) }),
  patchEntity: (id: string, patch: Partial<EntityState>) =>
    request<{ ok: boolean }>(`/api/home/entities/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // Media
  media: () => request<PlaybackState>("/api/spotify/state"),
  mediaCommand: (command: MediaCommand) =>
    request<{ ok: boolean }>("/api/spotify/command", { method: "POST", body: JSON.stringify(command) }),
  mediaSearch: (q: string) => request<SearchResult[]>(`/api/spotify/search?q=${encodeURIComponent(q)}`),
  mediaStatus: () => request<{ configured: boolean; authorized: boolean; authorizeUrl: string | null }>("/api/spotify/status"),

  // Household
  household: {
    list: () => request<HouseholdListResponse>("/api/household"),
    updateMember: (id: string, patch: HouseholdMemberInput & { actorId: string }) =>
      request<HouseholdMember>(`/api/household/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  },

  // Activity
  activity: () => request<ActivityFeed>("/api/activity"),

  // Settings
  settings: () => request<DashboardSettings>("/api/settings"),
  updateSettings: (patch: DashboardSettingsPatch) =>
    request<DashboardSettings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),

  // Voice (proxied to the voice service)
  voiceSession: (text: string, confirm = false) =>
    request<{
      id: string;
      state: string;
      transcript?: string;
      reply?: string;
      toolCalls?: { tool: string; arguments: Record<string, unknown> }[];
      pendingArguments?: Record<string, unknown>;
      requiresConfirmation: boolean;
      risk: string;
    }>("/voice/api/voice/session", { method: "POST", body: JSON.stringify({ text, confirm }) }),
};
