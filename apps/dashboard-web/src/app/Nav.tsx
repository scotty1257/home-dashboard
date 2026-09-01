import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Lightbulb,
  Music,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { View } from "../lib/store";
import { useNavStore } from "../lib/store";
import { cn } from "../lib/cn";

const TABS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "family", label: "Family", icon: Users },
  { id: "home", label: "Home", icon: Lightbulb },
  { id: "media", label: "Music", icon: Music },
  { id: "launch", label: "Launch", icon: Rocket },
];

export function Nav() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);

  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === view));

  return (
    <nav
      className="flex shrink-0 justify-center border-t border-line bg-panel/60 px-4 py-2 backdrop-blur-sm"
      aria-label="Primary"
    >
      {/* A centered cluster, not six tabs smeared across 1920px. Constraining
          the width keeps the targets within one thumb's travel of each other
          instead of hundreds of pixels apart. */}
      <div
        className="relative grid w-full max-w-4xl"
        style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
      >
        {/* One indicator that slides between tabs, rather than an element
            appearing and disappearing per tab. Transform-only so it composites. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 rounded-control bg-accent-soft transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] motion-reduce:transition-none"
          style={{
            width: `${100 / TABS.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {TABS.map((tab) => {
          const active = view === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "pressable relative flex min-h-touch flex-col items-center justify-center gap-1 rounded-control",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                active ? "text-accent-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              <Icon size={28} strokeWidth={active ? 2.2 : 2} aria-hidden />
              <span className={cn("text-meta font-medium", active && "font-semibold")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
