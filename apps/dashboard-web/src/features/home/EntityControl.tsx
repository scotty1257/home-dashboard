import type { CSSProperties } from "react";
import type { EntityState } from "@home-dashboard/contracts";
import { useHomeCommand } from "./useHomeCommand";
import { Toggle } from "../../components/Toggle";
import { TouchButton } from "../../components/TouchButton";
import { colorOf, domainIcon } from "../../lib/format";
import "./EntityControl.css";

interface Props {
  entity: EntityState;
  large?: boolean;
}

/** Renders the right touch control for an entity based on its domain + state. */
export function EntityControl({ entity, large = false }: Props) {
  const command = useHomeCommand();
  const accent = colorOf(entity.color);
  const icon = entity.icon ?? domainIcon(entity.domain);
  const label = entity.alias ?? entity.name;
  const isOn = entity.state === "on" || entity.state === "open" || entity.state === "playing" || entity.state === "unlocked";
  const unavailable = !entity.available;

  const send = (action: string, params: Record<string, unknown> = {}) => {
    if (entity.requiresConfirmation && !confirm(`Confirm: ${action.replace("_", " ")} ${label}?`)) return;
    command.mutate({ entityId: entity.id, action, params });
  };

  const isToggleable = ["light", "switch", "fan", "media_player"].includes(entity.domain);

  return (
    <div
      className={`entity ${large ? "entity--large" : ""} ${isOn ? "entity--on" : ""} ${unavailable ? "entity--offline" : ""}`}
      style={{ "--entity-accent": accent } as CSSProperties}
    >
      <div className="entity__top">
        <span className="entity__icon">{icon}</span>
        <span className="entity__name">{label}</span>
      </div>

      <div className="entity__state">
        {unavailable ? "unavailable" : stateLabel(entity)}
      </div>

      <div className="entity__control">
        {isToggleable && (
          <Toggle
            checked={isOn}
            onChange={(on) => send(on ? "turn_on" : "turn_off")}
            label={label}
            accent={entity.color}
            disabled={unavailable}
          />
        )}

        {entity.domain === "light" && isOn && (
          <input
            type="range"
            className="entity__slider"
            min={1}
            max={255}
            value={Number(entity.attributes.brightness ?? 255)}
            onChange={(e) => send("set_brightness", { brightness: Number(e.target.value) })}
            aria-label="Brightness"
            disabled={unavailable}
          />
        )}

        {entity.domain === "climate" && (
          <div className="entity__climate">
            <TouchButton variant="soft" onClick={() => send("set_temperature", { temperature: (Number(entity.attributes.temperature ?? 70)) - 1, hvac_mode: "heat" })}>−</TouchButton>
            <span className="entity__climate-temp">{Number(entity.attributes.temperature ?? entity.state)}°</span>
            <TouchButton variant="soft" onClick={() => send("set_temperature", { temperature: (Number(entity.attributes.temperature ?? 70)) + 1, hvac_mode: "heat" })}>+</TouchButton>
          </div>
        )}

        {entity.domain === "cover" && (
          <div className="entity__row">
            <TouchButton variant="soft" onClick={() => send("open_cover")} disabled={unavailable}>▲</TouchButton>
            <TouchButton variant="soft" onClick={() => send("close_cover")} disabled={unavailable}>▼</TouchButton>
          </div>
        )}

        {entity.domain === "lock" && (
          <TouchButton
            variant={isOn ? "danger" : "primary"}
            onClick={() => send(isOn ? "lock" : "unlock")}
            disabled={unavailable}
          >
            {isOn ? "Lock" : "Unlock"}
          </TouchButton>
        )}

        {entity.domain === "fan" && isOn && (
          <input
            type="range"
            className="entity__slider"
            min={0}
            max={100}
            value={Number(entity.attributes.percentage ?? 0)}
            onChange={(e) => send("set_fan_percentage", { percentage: Number(e.target.value) })}
            aria-label="Fan speed"
            disabled={unavailable}
          />
        )}

        {entity.domain === "media_player" && isOn && (
          <input
            type="range"
            className="entity__slider"
            min={0}
            max={100}
            value={Math.round(Number(entity.attributes.volume_level ?? 0.5) * 100)}
            onChange={(e) => send("set_volume", { volume_level: Number(e.target.value) / 100 })}
            aria-label="Volume"
            disabled={unavailable}
          />
        )}

        {(entity.domain === "sensor" || entity.domain === "binary_sensor") && (
          <span className="entity__readonly">read-only</span>
        )}
      </div>
    </div>
  );
}

function stateLabel(entity: EntityState): string {
  if (entity.domain === "climate") {
    const unit = entity.attributes.unit_of_measurement ? "" : "°";
    return `${entity.attributes.current_temperature ?? "—"}${unit} · ${entity.state}`;
  }
  if (entity.domain === "sensor") {
    return `${entity.state}${entity.attributes.unit_of_measurement ?? ""}`;
  }
  return entity.state;
}
