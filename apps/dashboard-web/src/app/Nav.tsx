import { LayoutDashboard, CalendarDays, Lightbulb, Music, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavStore } from "../lib/store";
import { cn } from "../lib/cn";

const TABS: { id: "overview" | "calendar" | "home" | "media" | "settings"; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "home", label: "Home", icon: Lightbulb },
  { id: "media", label: "Music", icon: Music },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);

  return (
    <nav className="flex h-16 shrink-0 items-stretch border-t border-line bg-panel/60 px-4" aria-label="Primary">
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
            <Icon size={22} strokeWidth={active ? 2.2 : 2} />
            <span className={cn("text-[11px] font-medium", active && "font-semibold")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
