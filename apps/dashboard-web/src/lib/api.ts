import type {
  ActivityFeed,
  BackupContact,
  BackupContactInput,
  CalendarEvent,
  CalendarEventInput,
  CalendarListResponse,
  DashboardSettings,
  DashboardSettingsPatch,
  DutyDefinition,
  DutyDefinitionInput,
  DutyEntryInput,
  DutyEntryView,
  DutySummary,
  EntityState,
  LaunchCurrentResponse,
  LaunchRun,
  LaunchTemplate,
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
  VoiceNote,
  VoiceNoteInput,
  VoiceNoteListResponse,
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

  // Duty ledger
  duties: {
    summary: (windowDays: number) =>
      request<DutySummary>(`/api/duties?windowDays=${encodeURIComponent(windowDays)}`),
    logEntry: (input: DutyEntryInput) =>
      request<DutyEntryView>("/api/duties/entries", { method: "POST", body: JSON.stringify(input) }),
    undoEntry: (id: string, actorId: string) =>
      request<{ entry: DutyEntryView }>(`/api/duties/entries/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: JSON.stringify({ actorId }),
      }),
    createDefinition: (input: DutyDefinitionInput & { actorId: string }) =>
      request<DutyDefinition>("/api/duties", { method: "POST", body: JSON.stringify(input) }),
    updateDefinition: (id: string, input: DutyDefinitionInput & { actorId: string }) =>
      request<DutyDefinition>(`/api/duties/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
  },

  // Voice notes (query key: ["voice-notes", recipientId])
  voiceNotes: {
    list: (recipientId: string, limit = 20) =>
      request<VoiceNoteListResponse>(
        `/api/voice-notes?recipientId=${encodeURIComponent(recipientId)}&limit=${limit}`,
      ),
    upload: (input: VoiceNoteInput, audio: Blob) => {
      const form = new FormData();
      form.append("metadata", JSON.stringify(input));
      const ext =
        input.mimeType === "audio/webm" ? "webm" : input.mimeType === "audio/ogg" ? "ogg" : "mp4";
      form.append("audio", audio, `note.${ext}`);
      // An explicitly empty headers object overrides the JSON content type,
      // letting fetch set the multipart boundary itself.
      return request<VoiceNote>("/api/voice-notes", { method: "POST", body: form, headers: {} });
    },
    markRead: (id: string) =>
      request<VoiceNote>(`/api/voice-notes/${encodeURIComponent(id)}/read`, { method: "POST" }),
    remove: (id: string) =>
      request<void>(`/api/voice-notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  // Launch sequences (query key: ["launch"]; mutations invalidate it)
  launch: {
    current: (at?: string) =>
      request<LaunchCurrentResponse>(`/api/launch/current${at ? `?at=${encodeURIComponent(at)}` : ""}`),
    toggleStep: (runId: string, stepId: string, actorId: string) =>
      request<{ run: LaunchRun }>(
        `/api/launch/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/toggle`,
        { method: "POST", body: JSON.stringify({ actorId }) },
      ),
    chimePlayed: (runId: string, actorId?: string) =>
      request<{ run: LaunchRun }>(`/api/launch/runs/${encodeURIComponent(runId)}/chime-played`, {
        method: "POST",
        body: JSON.stringify({ actorId }),
      }),
    reset: (runId: string, actorId: string) =>
      request<{ run: LaunchRun }>(`/api/launch/runs/${encodeURIComponent(runId)}/reset`, {
        method: "POST",
        body: JSON.stringify({ actorId }),
      }),
    templates: () => request<{ templates: LaunchTemplate[] }>("/api/launch/templates"),
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
