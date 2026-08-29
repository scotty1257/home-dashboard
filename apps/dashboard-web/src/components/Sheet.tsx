import type { ReactNode } from "react";
import { useEffect } from "react";
import "./Sheet.css";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Large sheet for editors, or bottom sheet for quick actions. */
  size?: "md" | "lg";
}

/** Modal sheet for editing. Closes on backdrop tap or Escape. */
export function Sheet({ open, onClose, title, children, size = "md" }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-overlay" onPointerDown={onClose} role="presentation">
      <div
        className={`sheet sheet--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" />
        {title && <h2 className="sheet__title">{title}</h2>}
        <div className="sheet__content">{children}</div>
      </div>
    </div>
  );
}
