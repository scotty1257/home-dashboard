import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, House, Settings } from "lucide-react";
import { api } from "../lib/api";
import { TouchButton } from "../components/TouchButton";
import { useVoiceStore, useNavStore } from "../lib/store";
import { ActorSwitcher } from "../features/household/ActorSwitcher";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { formatClock, formatDate } from "../lib/format";

/**
 * One status cluster instead of three. Three separate dot+icon+word groups of
 * 14px type, capitalised inconsistently ("Demo" beside "demo"), read as clutter
 * from a foot away and as nothing at all from across the room.
 *
 * What a family actually needs to know is whether anything is running on demo
 * data. So: say nothing when everything is live, and say one plain sentence
 * when it is not.
 */
function DemoBadge({ services }: { services: string[] }) {
  if (services.length === 0) return null;
  return (
    <span className="flex items-center gap-2 rounded-pill bg-warning/12 px-3 py-1.5 text-meta font-medium text-warning">
      <span aria-hidden className="inline-block h-2 w-2 rounded-pill bg-warning" />
      {services.join(" and ")} on demo data
    </span>
  );
}

export function Header() {
  const [now, setNow] = useState(() => new Date());
  const setVoiceOpen = useVoiceStore((s) => s.setOpen);
  const setView = useNavStore((s) => s.setView);

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 60_000 });
  const { data: spotify } = useQuery({ queryKey: ["media-status"], queryFn: api.mediaStatus, refetchInterval: 60_000 });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const homeDetail = health?.services.find((s) => s.service === "home")?.detail ?? "demo";
  const demoServices = [
    homeDetail === "demo" ? "Home" : null,
    spotify?.authorized ? null : "Music",
  ].filter((s): s is string => s !== null);

  return (
    <header className="flex shrink-0 items-center gap-6 border-b border-line bg-panel/60 px-6 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-inner bg-accent text-white">
          <House size={16} strokeWidth={2.2} />
        </span>
        <span className="truncate text-body-lg font-semibold tracking-tight text-ink">
          Danson-Dennis Family
        </span>
        <ActorSwitcher />
      </div>

      <div className="flex flex-1 items-center justify-center gap-3">
        <span className="text-clock font-semibold tracking-tight text-ink tabular-nums leading-none">
          {formatClock(now)}
        </span>
        <span className="text-body text-ink-3">{formatDate(now)}</span>
      </div>

      <div className="flex items-center gap-4">
        <DemoBadge services={demoServices} />

        <NotificationBell />

        <TouchButton
          variant="ghost"
          icon={Settings}
          iconOnly
          aria-label="Settings"
          onClick={() => setView("settings")}
        />

        {/* The primary action on the screen, sized like one: 72px tall, which
            is the hero touch target rather than the 56px floor. */}
        <TouchButton
          variant="primary"
          icon={Mic}
          onClick={() => setVoiceOpen(true)}
          aria-label="Open voice assistant"
          className="min-h-touch-lg px-6 text-body-lg"
        >
          Assistant
        </TouchButton>
      </div>
    </header>
  );
}
