import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

interface Props {
  title?: string;
  icon?: LucideIcon;
  /** Semantic color token name used to tint the header icon. */
  accent?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Clean card: tight radius, hairline border, consistent internal spacing. */
export function Panel({ title, icon: Icon, accent, children, actions, className, bodyClassName }: Props) {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-panel shadow-panel",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
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
      <div className={cn("px-5 pb-5 pt-1", bodyClassName)}>{children}</div>
    </section>
  );
}
