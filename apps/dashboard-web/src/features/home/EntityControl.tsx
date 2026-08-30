import type { CSSProperties } from "react";
import { Minus, Plus, ArrowUp, ArrowDown, Lock, LockOpen } from "lucide-react";
import type { EntityState } from "@home-dashboard/contracts";
import { useHomeCommand } from "./useHomeCommand";
import { Toggle } from "../../components/Toggle";
import { TouchButton } from "../../components/TouchButton";
import { RangeControl } from "../../components/RangeControl";
import { colorOf } from "../../lib/colors";
import { domainIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";

interface Props {
  entity: EntityState;
  large?: boolean;
}

export function EntityControl({ entity, large = false }: Props) {
  const command = useHomeCommand();
  const accent = colorOf(entity.color);
  const Icon = domainIcon(entity.domain);
  const label = entity.alias ?? entity.name;
  const isOn =
    entity.state === "on" || entity.state === "open" || entity.state === "playing" || entity.state === "unlocked";
  const unavailable = !entity.available;

  const send = (action: string, params: Record<string, unknown> = {}) => {
    if (entity.requiresConfirmation && !confirm(`Confirm: ${action.replace(/_/g, " ")} ${label}?`)) return;
    command.mutate({ entityId: entity.id, action, params });
  };

  const isToggleable = ["light", "switch", "fan", "media_player"].includes(entity.domain);

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-panel p-4",
        isOn ? "border-line-strong" : "border-line",
        unavailable && "opacity-50",
        large && "sm:col-span-2",
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2.5">
        <Icon size={20} strokeWidth={1.9} style={{ color: accent }} className="shrink-0" />
        <span className="truncate text-sm font-medium text-ink">{label}</span>
        <span className="ml-auto text-xs capitalize text-ink-3">{unavailable ? "unavailable" : stateLabel(entity)}</span>
      </div>

      <div className="flex min-h-12 items-center gap-3">
        {isToggleable && (
          <Toggle
            checked={isOn}
            onChange={(on) => send(on ? "turn_on" : "turn_off")}
            label={label}
            disabled={unavailable}
          />
        )}

        {entity.domain === "light" && isOn && (
          <RangeControl
            min={1}
            max={255}
            value={Number(entity.attributes.brightness ?? 255)}
            onChange={(v) => send("set_brightness", { brightness: v })}
            aria-label="Brightness"
            disabled={unavailable}
            style={{ "--tw-accent": accent } as CSSProperties}
          />
        )}

        {entity.domain === "climate" && (
          <div className="flex items-center gap-2">
            <TouchButton
              variant="soft"
              icon={Minus}
              iconOnly
              aria-label="Cooler"
              onClick={() => send("set_temperature", { temperature: (Number(entity.attributes.temperature ?? 70)) - 1, hvac_mode: "heat" })}
            />
            <span className="min-w-[48px] text-center text-base font-semibold tabular-nums">
              {Number(entity.attributes.temperature ?? entity.state)}°
            </span>
            <TouchButton
              variant="soft"
              icon={Plus}
              iconOnly
              aria-label="Warmer"
              onClick={() => send("set_temperature", { temperature: (Number(entity.attributes.temperature ?? 70)) + 1, hvac_mode: "heat" })}
            />
          </div>
        )}

        {entity.domain === "cover" && (
          <div className="flex gap-2">
            <TouchButton variant="soft" icon={ArrowUp} iconOnly onClick={() => send("open_cover")} disabled={unavailable} aria-label="Open" />
            <TouchButton variant="soft" icon={ArrowDown} iconOnly onClick={() => send("close_cover")} disabled={unavailable} aria-label="Close" />
          </div>
        )}

        {entity.domain === "lock" && (
          <TouchButton
            variant={isOn ? "danger" : "primary"}
            icon={isOn ? Lock : LockOpen}
            onClick={() => send(isOn ? "lock" : "unlock")}
            disabled={unavailable}
          >
            {isOn ? "Lock" : "Unlock"}
          </TouchButton>
        )}

        {entity.domain === "fan" && isOn && (
          <RangeControl
            min={0}
            max={100}
            value={Number(entity.attributes.percentage ?? 0)}
            onChange={(v) => send("set_fan_percentage", { percentage: v })}
            aria-label="Fan speed"
            disabled={unavailable}
          />
        )}

        {entity.domain === "media_player" && isOn && (
          <RangeControl
            min={0}
            max={100}
            value={Math.round(Number(entity.attributes.volume_level ?? 0.5) * 100)}
            onChange={(v) => send("set_volume", { volume_level: v / 100 })}
            aria-label="Volume"
            disabled={unavailable}
          />
        )}

        {(entity.domain === "sensor" || entity.domain === "binary_sensor") && (
          <span className="text-xs uppercase tracking-wide text-ink-4">read-only</span>
        )}
      </div>
    </div>
  );
}

function stateLabel(entity: EntityState): string {
  if (entity.domain === "sensor") {
    return `${entity.state}${entity.attributes.unit_of_measurement ?? ""}`;
  }
  return entity.state;
}
