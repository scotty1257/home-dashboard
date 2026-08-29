import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColorToken } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { Toggle } from "../../components/Toggle";
import { TouchButton } from "../../components/TouchButton";
import { colors, colorOf } from "../../lib/format";
import "./SettingsScreen.css";

const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "auto", label: "Auto" },
] as const;

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
    <div className="settings">
      <Panel title="Appearance" icon="🎨" accent="violet">
        <div className="settings-row">
          <span className="settings-label">Theme</span>
          <div className="segmented">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`segmented__item ${settings.theme === t.id ? "segmented__item--active" : ""}`}
                onClick={() => set({ theme: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Accent color</span>
          <div className="color-swatches">
            {(Object.keys(colors) as ColorToken[]).map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${settings.accentColor === c ? "color-swatch--active" : ""}`}
                style={{ background: colorOf(c) }}
                aria-label={c}
                onClick={() => set({ accentColor: c })}
              />
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <span className="settings-label">Night mode</span>
            <span className="settings-hint">Dimmer colors between set hours</span>
          </div>
          <Toggle checked={settings.nightModeEnabled} onChange={(v) => set({ nightModeEnabled: v })} accent="indigo" label="Night mode" />
        </div>
      </Panel>

      <Panel title="Units & Location" icon="🌍" accent="sky">
        <div className="settings-row">
          <span className="settings-label">Temperature</span>
          <div className="segmented">
            <button className={`segmented__item ${settings.temperatureUnits === "imperial" ? "segmented__item--active" : ""}`} onClick={() => set({ temperatureUnits: "imperial" })}>°F</button>
            <button className={`segmented__item ${settings.temperatureUnits === "metric" ? "segmented__item--active" : ""}`} onClick={() => set({ temperatureUnits: "metric" })}>°C</button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">Timezone</span>
          <span className="settings-value">{settings.timezone}</span>
        </div>
      </Panel>

      <Panel title="Voice Assistant" icon="🎙️" accent="rose">
        <div className="settings-row">
          <div>
            <span className="settings-label">Push to talk</span>
            <span className="settings-hint">Tap the microphone to talk</span>
          </div>
          <Toggle checked={settings.voice.pushToTalkEnabled} onChange={(v) => set({ voice: { ...settings.voice, pushToTalkEnabled: v } })} accent="rose" label="Push to talk" />
        </div>
        <div className="settings-row">
          <div>
            <span className="settings-label">Confirm high-risk actions</span>
            <span className="settings-hint">Require a tap before locks/doors change</span>
          </div>
          <Toggle checked={settings.voice.confirmHighRisk} onChange={(v) => set({ voice: { ...settings.voice, confirmHighRisk: v } })} accent="amber" label="Confirm high-risk" />
        </div>
      </Panel>

      <Panel title="Integrations" icon="🔌" accent="teal">
        <div className="settings-row">
          <div>
            <span className="settings-label">Home Assistant</span>
            <span className="settings-value">Set via API environment (HA_URL / HA_TOKEN)</span>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <span className="settings-label">Spotify</span>
            <span className="settings-value">
              {spotify?.authorized ? "Connected" : spotify?.configured ? "Not authorized" : "Demo mode (not configured)"}
            </span>
          </div>
          {spotify?.configured && !spotify?.authorized && (
            <TouchButton variant="primary" onClick={() => (window.location.href = "/api/spotify/auth")}>Connect</TouchButton>
          )}
        </div>
      </Panel>
    </div>
  );
}
