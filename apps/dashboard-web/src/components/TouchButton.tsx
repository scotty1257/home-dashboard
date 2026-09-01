import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { ICON } from "../lib/icons";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: "primary" | "ghost" | "soft" | "danger";
  icon?: LucideIcon;
  /** Render icon only (square button). */
  iconOnly?: boolean;
  /** Glyph size in px. The button is already ≥56px; this sizes what's inside it. */
  iconSize?: number;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill text-body font-medium " +
  "transition-colors duration-100 select-none disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60 " +
  "pressable ripple-host";

const variants: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-accent text-white hover:bg-accent-2 min-h-touch px-5",
  ghost: "text-ink-2 hover:text-ink hover:bg-raised min-h-touch px-4",
  soft: "bg-surface hover:bg-raised border border-line text-ink min-h-touch px-5",
  danger: "bg-danger text-white hover:brightness-110 min-h-touch px-5",
};

/** A transient ripple that blooms from the tap point. */
function useRipple() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const nextId = useRef(0);

  const spawn = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Size to cover the largest dimension so the bloom always fills the control.
    const size = Math.max(rect.width, rect.height) * 2.2;
    const id = nextId.current++;
    setRipples((r) => [...r, { id, x, y, size }]);
    window.setTimeout(() => {
      setRipples((r) => r.filter((rip) => rip.id !== id));
    }, 360);
  };

  return { ripples, spawn };
}

/** Accessible touch button (≥56px target) with Lucide vector icons,
 *  spring press-squish, and a ripple that blooms from the finger. */
export function TouchButton({
  children,
  variant = "soft",
  icon: Icon,
  iconOnly = false,
  iconSize = ICON.md,
  className,
  onPointerDown,
  ...rest
}: Props) {
  const { ripples, spawn } = useRipple();

  return (
    <button
      type="button"
      className={cn(base, variants[variant], iconOnly && "min-w-touch px-0", className)}
      onPointerDown={(event) => {
        spawn(event);
        onPointerDown?.(event);
      }}
      {...rest}
    >
      {Icon && <Icon size={iconSize} strokeWidth={2} aria-hidden />}
      {!iconOnly && children != null && <span>{children}</span>}
      {ripples.map((rip) => (
        <span
          key={rip.id}
          aria-hidden
          className="ripple-ink"
          style={{
            left: rip.x,
            top: rip.y,
            width: rip.size,
            height: rip.size,
          }}
        />
      ))}
    </button>
  );
}
