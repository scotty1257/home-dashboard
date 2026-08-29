import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: "primary" | "ghost" | "soft" | "danger";
  icon?: LucideIcon;
  /** Render icon only (square button). */
  iconOnly?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium " +
  "transition-colors duration-100 select-none disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60 " +
  "active:translate-y-px";

const variants: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-accent text-white hover:bg-accent-2 min-h-12 px-5",
  ghost: "text-ink-2 hover:text-ink hover:bg-raised min-h-12 px-4",
  soft: "bg-surface hover:bg-raised border border-line text-ink min-h-12 px-5",
  danger: "bg-danger text-white hover:brightness-110 min-h-12 px-5",
};

/** Accessible touch button (≥48px target) with Lucide vector icons. */
export function TouchButton({
  children,
  variant = "soft",
  icon: Icon,
  iconOnly = false,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cn(
        base,
        variants[variant],
        iconOnly && "min-w-12 px-0",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={18} strokeWidth={2} aria-hidden />}
      {!iconOnly && children != null && <span>{children}</span>}
    </button>
  );
}
