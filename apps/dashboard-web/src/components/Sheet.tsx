import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "md" | "lg";
}

/**
 * Bottom sheet for editing. Closes on backdrop tap or Escape.
 *
 * Rendered through a portal into document.body. `position: fixed` resolves
 * against the nearest ancestor that establishes a containing block, and Panel
 * carries `backdrop-blur-md` — so a sheet rendered inside a card was clamped to
 * that card's box (measured at 606×1008 at (25,378) instead of covering the
 * 1920×1080 viewport) and had to be scrolled to. A portal puts it outside every
 * such ancestor, so no future transform/filter/will-change can trap it again.
 */
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

  return createPortal(
    <div
      className="fixed inset-0 z-sheet flex items-end justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "flex w-full flex-col rounded-t-xl border border-b-0 border-line bg-panel shadow-2xl backdrop-blur-md",
          "max-h-[88vh] animate-[slideUp_0.22s_cubic-bezier(0.22,1,0.36,1)]",
          size === "md" ? "max-w-xl" : "max-w-2xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-pill bg-line-strong" />
        {title && <h2 className="px-6 pt-4 text-metric font-semibold text-ink">{title}</h2>}
        <div className="overflow-y-auto px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
