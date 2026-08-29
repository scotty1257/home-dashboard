import type { CSSProperties } from "react";
import { colorOf } from "../lib/format";
import "./Toggle.css";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  accent?: string;
  disabled?: boolean;
}

/** A large, colorful toggle switch with a 48px touch target. */
export function Toggle({ checked, onChange, label, accent = "accent", disabled }: Props) {
  const color = accent === "accent" ? "var(--accent)" : colorOf(accent);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? "toggle--on" : ""}`}
      style={{ "--toggle-color": color } as CSSProperties}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
    </button>
  );
}
