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
}

const headerDensity = {
  default: "px-6 pt-4 pb-3",
  compact: "px-4 pt-3 pb-2",
} as const;

const bodyDensity = {
  default: "px-6 pb-6 pt-1",
  compact: "px-4 pb-4 pt-1",
} as const;

/** Clean card: tight radius, hairline border, consistent internal spacing. */
export function Panel({
  title,
  icon: Icon,
  accent,
  density = "default",
  children,
  actions,
  className,
  bodyClassName,
}: Props) {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-panel shadow-panel backdrop-blur-md",
        className,
      )}
    >
      {(title || actions) && (
        <header
          className={cn(
            "flex items-center justify-between gap-3",
            headerDensity[density],
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
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3 truncate">
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
