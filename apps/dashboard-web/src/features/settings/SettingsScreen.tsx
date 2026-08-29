import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Thermometer, Mic, ShieldCheck, Plug, Music2, Users } from "lucide-react";
import type { HouseholdMember, HouseholdMemberInput } from "@home-dashboard/contracts";
import { api, ApiError } from "../../lib/api";
import { memberIcon, useActiveActor } from "../household/ActorSwitcher";
import { Panel } from "../../components/Panel";
import { Toggle } from "../../components/Toggle";
import { TouchButton } from "../../components/TouchButton";
import { cn } from "../../lib/cn";

const row = "flex items-center justify-between gap-4 py-3 border-b border-line last:border-0";

const ICON_KEYS = ["user", "user-round", "baby", "heart", "star"] as const;

/** One editable member: name input (save on blur/Enter) + icon select. */
function MemberEditor({
  member,
  onSave,
}: {
  member: HouseholdMember;
  onSave: (id: string, patch: HouseholdMemberInput) => void;
}) {
  const [name, setName] = useState(member.displayName);

  useEffect(() => {
    setName(member.displayName);
  }, [member.displayName]);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== member.displayName) onSave(member.id, { displayName: trimmed });
  };

  const Icon = memberIcon(member.icon);

  return (
    <div className={row}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon
          size={18}
          strokeWidth={2}
          aria-hidden
          style={{ color: `var(--color-${member.color})` }}
        />
        <input
          value={name}
          aria-label={`${member.displayName} name`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="min-h-12 w-full max-w-56 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-2/60"
        />
      </div>
      <select
        aria-label={`${member.displayName} icon`}
        value={member.icon}
        onChange={(e) => onSave(member.id, { icon: e.target.value as HouseholdMember["icon"] })}
        className="min-h-12 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-2/60"
      >
        {ICON_KEYS.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Household roster with per-member editing, attributed to the active actor. */
function HouseholdPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["household"], queryFn: api.household.list });
  const { actor } = useActiveActor();
  const [error, setError] = useState<string | null>(null);
  const members = data?.members ?? [];

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HouseholdMemberInput }) =>
      api.household.updateMember(id, { ...patch, actorId: actor?.id ?? "" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["household"] }),
    onError: (err) => {
      // 403 = the active actor is a child; the API refuses, we just shrug.
      if (err instanceof ApiError && err.status === 403) return;
      setError(err instanceof Error ? err.message : "Update failed");
    },
  });

  return (
    <Panel title="Household" icon={Users} accent="indigo">
      {actor?.role === "child" && (
        <div className="pb-3 text-xs text-ink-3">Adults only — kid profiles can view but not edit members</div>
      )}
      {error && <div className="pb-3 text-xs text-danger">{error}</div>}
      {members.map((member) => (
        <MemberEditor
          key={member.id}
          member={member}
          onSave={(id, patch) => {
            setError(null);
            update.mutate({ id, patch });
          }}
        />
      ))}
    </Panel>
  );
}

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: spotify } = useQuery({ queryKey: ["media-status"], queryFn: api.mediaStatus });

  const update = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  if (!settings) return null;

  const set = (patch: Parameters<typeof api.updateSettings>[0]) => update.mutate(patch);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <HouseholdPanel />

      <Panel title="Units" icon={Thermometer} accent="sky">
        <div className={cn(row, "pt-1")}>
          <div>
            <div className="text-sm font-medium text-ink">Temperature</div>
            <div className="text-xs text-ink-3">Displayed in weather and climate controls</div>
          </div>
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {(["imperial", "metric"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => set({ temperatureUnits: u })}
                className={cn(
                  "rounded px-4 py-1.5 text-sm font-medium transition-colors",
                  settings.temperatureUnits === u ? "bg-accent text-white" : "text-ink-3 hover:text-ink",
                )}
              >
                {u === "imperial" ? "°F" : "°C"}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <div>
            <div className="text-sm font-medium text-ink">Theme</div>
            <div className="text-xs text-ink-3">Automatically light by day, dark by night</div>
          </div>
          <span className="text-sm text-ink-3">Auto (time of day)</span>
        </div>
      </Panel>

      <Panel title="Voice Assistant" icon={Mic} accent="rose">
        <div className={cn(row, "pt-1")}>
          <div>
            <div className="text-sm font-medium text-ink">Push to talk</div>
            <div className="text-xs text-ink-3">Tap the microphone to speak</div>
          </div>
          <Toggle
            checked={settings.voice.pushToTalkEnabled}
            onChange={(v) => set({ voice: { ...settings.voice, pushToTalkEnabled: v } })}
            label="Push to talk"
          />
        </div>
        <div className={row}>
          <div>
            <div className="text-sm font-medium text-ink">Confirm high-risk actions</div>
            <div className="text-xs text-ink-3">Require a tap before locks and doors change</div>
          </div>
          <Toggle
            checked={settings.voice.confirmHighRisk}
            onChange={(v) => set({ voice: { ...settings.voice, confirmHighRisk: v } })}
            label="Confirm high-risk"
          />
        </div>
      </Panel>

      <Panel title="Integrations" icon={Plug} accent="teal">
        <div className={cn(row, "pt-1")}>
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-ink-3" />
            <div>
              <div className="text-sm font-medium text-ink">Home Assistant</div>
              <div className="text-xs text-ink-3">Configure via HA_URL / HA_TOKEN in the environment</div>
            </div>
          </div>
          <span className="text-sm text-ink-3">API</span>
        </div>
        <div className={row}>
          <div className="flex items-center gap-3">
            <Music2 size={18} className="text-ink-3" />
            <div>
              <div className="text-sm font-medium text-ink">Spotify</div>
              <div className="text-xs text-ink-3">
                {spotify?.authorized ? "Connected" : spotify?.configured ? "Not authorized" : "Demo mode (not configured)"}
              </div>
            </div>
          </div>
          {spotify?.configured && !spotify?.authorized && (
            <TouchButton variant="primary" onClick={() => (window.location.href = "/api/spotify/auth")}>
              Connect
            </TouchButton>
          )}
        </div>
      </Panel>
    </div>
  );
}
