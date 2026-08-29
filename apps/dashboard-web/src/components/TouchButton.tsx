import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./TouchButton.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: "primary" | "ghost" | "soft" | "danger";
  icon?: ReactNode;
}

/** Accessible touch button with a >=48px target and a visible pressed state. */
export function TouchButton({ children, variant = "soft", icon, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`touch-btn touch-btn--${variant} ${className}`}
      {...rest}
    >
      {icon && <span className="touch-btn__icon">{icon}</span>}
      <span className="touch-btn__label">{children}</span>
    </button>
  );
}
