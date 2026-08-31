import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

interface Props {
  title?: string;
  icon?: LucideIcon;
  /** Semantic color token name used to tint the header icon. */
  accent?: string;
  /** Layout density: `default` = 24px panel padding, `compact` = 16px. */
  density?: "default" | "compact";
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Extra header classes — e.g. to let a full-bleed backdrop show through. */
  headerClassName?: string;
  /**
   * Full-bleed layer behind the whole card, header included. Rendered as the
   * section's first child, so an absolutely-positioned backdrop covers the
   * header too rather than starting below it.
   */
  backdrop?: ReactNode;
}

const headerDensity = {
  default: "px-6 pt-4 pb-3",
  compact: "px-4 pt-3 pb-2",
} as const;

const bodyDensity = {
  default: "px-6 pb-6 pt-1",
  compact: "px-4 pb-4 pt-1",
} as const;

/** Clean card: tight radius, hairline border, consistent internal spacing.
 *
 * Titles are sentence case at body size, not tracked-out ALL-CAPS eyebrows —
 * a card whose content already says what it is (a 74° and a sun icon) does not
 * need a sign reading WEATHER above it. Panels where the title would be
 * redundant pass no `title` at all. */
export function Panel({
  title,
  icon: Icon,
  accent,
  density = "default",
  children,
  actions,
  className,
  bodyClassName,
  headerClassName,
  backdrop,
}: Props) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-panel shadow-panel backdrop-blur-md",
        className,
      )}
    >
      {backdrop}
      {(title || actions) && (
        <header
          className={cn(
            "flex items-center justify-between gap-3",
            headerDensity[density],
            headerClassName,
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <Icon
                size={16}
                strokeWidth={2}
                className="shrink-0 text-ink-3"
                style={accent ? { color: `var(--color-${accent})` } : undefined}
                aria-hidden
              />
            )}
            {title && (
              <h2 className="truncate text-body font-semibold text-ink-2">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(bodyDensity[density], bodyClassName)}>{children}</div>
    </section>
  );
}
