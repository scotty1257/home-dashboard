import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Thermometer,
  Mic,
  ShieldCheck,
  Plug,
  Music2,
  Users,
  HeartHandshake,
} from "lucide-react";
import type {
  DashboardSettingsPatch,
  FamilySettings,
  HouseholdMember,
  HouseholdMemberInput,
} from "@home-dashboard/contracts";
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

/** Shared field shell: label + description on the left, control on the right. */
function Field({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={row}>
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs text-ink-3">{hint}</div>
      </div>
      {children}
    </div>
  );
}

/**
 * Family-coordination settings: the night-before handoff alert time, the
 * travel/overrun buffers used for conflict detection, and the duty summary
 * window. Edited locally, saved as one `updateSettings({ family })` patch.
 */
function FamilyPanel({
  family,
  saving,
  onSave,
}: {
  family: FamilySettings;
  saving: boolean;
  onSave: (patch: DashboardSettingsPatch) => void;
}) {
  const [handoffAlertTime, setHandoffAlertTime] = useState(family.handoffAlertTime);
  const [travelBufferMinutes, setTravelBufferMinutes] = useState(family.travelBufferMinutes);
  const [overrunBufferMinutes, setOverrunBufferMinutes] = useState(family.overrunBufferMinutes);
  const [dutyWindowDays, setDutyWindowDays] = useState(family.dutyWindowDays);

  // Refetches (e.g. after a save) re-sync the form from the stored settings.
  useEffect(() => {
    setHandoffAlertTime(family.handoffAlertTime);
    setTravelBufferMinutes(family.travelBufferMinutes);
    setOverrunBufferMinutes(family.overrunBufferMinutes);
    setDutyWindowDays(family.dutyWindowDays);
  }, [family]);

  const save = () =>
    onSave({
      family: {
        handoffAlertTime,
        travelBufferMinutes: Number(travelBufferMinutes),
        overrunBufferMinutes: Number(overrunBufferMinutes),
        dutyWindowDays: Number(dutyWindowDays),
      },
    });

  const numberInput =
    "min-h-12 w-24 rounded-md border border-line bg-surface px-3 text-sm tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-accent-2/60";

  return (
    <Panel title="Family" icon={HeartHandshake} accent="rose">
      <Field title="Handoff alert time" hint="When the night-before board starts demanding attention">
        <input
          type="time"
          aria-label="Handoff alert time"
          value={handoffAlertTime}
          onChange={(e) => setHandoffAlertTime(e.target.value)}
          className="min-h-12 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-2/60"
        />
      </Field>
      <Field title="Travel buffer" hint="Minutes before an event blocked for travel">
        <input
          type="number"
          min={0}
          max={120}
          aria-label="Travel buffer minutes"
          value={travelBufferMinutes}
          onChange={(e) => setTravelBufferMinutes(Number(e.target.value))}
          className={numberInput}
        />
      </Field>
      <Field title="Overrun buffer" hint="Minutes after an event blocked for overrun">
        <input
          type="number"
          min={0}
          max={120}
          aria-label="Overrun buffer minutes"
          value={overrunBufferMinutes}
          onChange={(e) => setOverrunBufferMinutes(Number(e.target.value))}
          className={numberInput}
        />
      </Field>
      <Field title="Duty window" hint="Rolling window (days) for the duty summary">
        <input
          type="number"
          min={1}
          max={365}
          aria-label="Duty window days"
          value={dutyWindowDays}
          onChange={(e) => setDutyWindowDays(Number(e.target.value))}
          className={numberInput}
        />
      </Field>
      <div className="pt-3">
        <TouchButton variant="primary" disabled={saving} onClick={save}>
          Save family settings
        </TouchButton>
      </div>
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
    <div data-testid="settings-grid" className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 xl:grid-cols-2">
      <HouseholdPanel />

      <FamilyPanel family={settings.family} saving={update.isPending} onSave={set} />

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
