import type { CSSProperties, ReactNode } from "react";
import { colorOf } from "../lib/format";
import "./Panel.css";

interface Props {
  title?: string;
  icon?: ReactNode;
  accent?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  pad?: boolean;
}

/** A rounded card container used across the dashboard. */
export function Panel({ title, icon, accent, children, actions, className = "", pad = true }: Props) {
  const accentColor = accent ? colorOf(accent) : undefined;
  return (
    <section
      className={`panel ${className}`}
      style={accentColor ? { "--panel-accent": accentColor } as CSSProperties : undefined}
    >
      {(title || actions) && (
        <header className="panel__header">
          <div className="panel__title">
            {icon && <span className="panel__icon">{icon}</span>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className={`panel__body ${pad ? "panel__body--pad" : ""}`}>{children}</div>
    </section>
  );
}
