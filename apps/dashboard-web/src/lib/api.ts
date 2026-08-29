import type {
  ActivityFeed,
  BackupContact,
  BackupContactInput,
  CalendarEvent,
  CalendarEventInput,
  CalendarListResponse,
  DashboardSettings,
  DashboardSettingsPatch,
  EntityState,
  HandoffBackupInput,
  HandoffBoardItem,
  HandoffBoardResponse,
  HandoffCreateInput,
  HandoffObligation,
  HomeCommand,
  HomeSnapshot,
  HouseholdListResponse,
  HouseholdMember,
  HouseholdMemberInput,
  MediaCommand,
  PermissionDecisionInput,
  PermissionQueueResponse,
  PermissionReopenInput,
  PermissionRequestInput,
  PermissionRequestWithDecisions,
  PermissionRule,
  PermissionRuleInput,
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

  // Handoffs
  handoffs: {
    board: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const query = params.toString();
      return request<HandoffBoardResponse>(`/api/handoffs${query ? `?${query}` : ""}`);
    },
    create: (input: HandoffCreateInput) =>
      request<HandoffObligation>("/api/handoffs", { method: "POST", body: JSON.stringify(input) }),
    claim: (id: string, actorId: string) =>
      request<HandoffBoardItem>(`/api/handoffs/${id}/claim`, {
        method: "PATCH",
        body: JSON.stringify({ actorId }),
      }),
    requestBackup: (id: string, input: HandoffBackupInput) =>
      request<HandoffBoardItem>(`/api/handoffs/${id}/request-backup`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    resolve: (id: string, actorId: string) =>
      request<HandoffBoardItem>(`/api/handoffs/${id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ actorId }),
      }),
  },

  // Backup contacts
  backupContacts: {
    list: () => request<{ contacts: BackupContact[] }>("/api/backup-contacts"),
    create: (input: BackupContactInput) =>
      request<BackupContact>("/api/backup-contacts", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: BackupContactInput) =>
      request<BackupContact>(`/api/backup-contacts/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  },

  // Permission queue
  permissions: {
    queue: () => request<PermissionQueueResponse>("/api/permissions"),
    create: (input: PermissionRequestInput) =>
      request<PermissionRequestWithDecisions>("/api/permissions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    decide: (id: string, input: PermissionDecisionInput) =>
      request<{ request: PermissionRequestWithDecisions }>(`/api/permissions/${id}/decision`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    reopen: (id: string, input: PermissionReopenInput) =>
      request<{ request: PermissionRequestWithDecisions }>(`/api/permissions/${id}/reopen`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

  // Standing permission rules
  permissionRules: {
    list: () => request<{ rules: PermissionRule[] }>("/api/permission-rules"),
    create: (input: PermissionRuleInput) =>
      request<PermissionRule>("/api/permission-rules", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: PermissionRuleInput) =>
      request<PermissionRule>(`/api/permission-rules/${id}`, { method: "PUT", body: JSON.stringify(input) }),
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
