import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Thermometer, Mic, ShieldCheck, Plug, Music2 } from "lucide-react";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { Toggle } from "../../components/Toggle";
import { TouchButton } from "../../components/TouchButton";
import { cn } from "../../lib/cn";

const row = "flex items-center justify-between gap-4 py-3 border-b border-line last:border-0";

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
