import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Rocket,
  Lightbulb,
  Music,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { View } from "../lib/store";
import { useNavStore } from "../lib/store";
import { cn } from "../lib/cn";

const TABS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "family", label: "Family", icon: Users },
  { id: "launch", label: "Launch", icon: Rocket },
  { id: "home", label: "Home", icon: Lightbulb },
  { id: "media", label: "Music", icon: Music },
];

export function Nav() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);

  return (
    <nav className="flex h-16 shrink-0 items-stretch border-t border-line bg-panel/60 px-4 backdrop-blur-sm" aria-label="Primary">
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
              "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-md text-ink-3",
              "transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
              active && "text-accent",
            )}
          >
            {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" />}
            <Icon size={24} strokeWidth={active ? 2.2 : 2} aria-hidden />
            <span className={cn("text-[12px] font-medium", active && "font-semibold")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
