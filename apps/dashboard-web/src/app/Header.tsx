import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, House, CloudSun, Music } from "lucide-react";
import { api } from "../lib/api";
import { TouchButton } from "../components/TouchButton";
import { useVoiceStore } from "../lib/store";
import { formatClock, formatDate } from "../lib/format";
import { cn } from "../lib/cn";

function StatusDot({ tone }: { tone: "ok" | "muted" | "down" }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        tone === "ok" && "bg-success",
        tone === "muted" && "bg-ink-4",
        tone === "down" && "bg-danger",
      )}
    />
  );
}

export function Header() {
  const [now, setNow] = useState(() => new Date());
  const setVoiceOpen = useVoiceStore((s) => s.setOpen);

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 60_000 });
  const { data: spotify } = useQuery({ queryKey: ["media-status"], queryFn: api.mediaStatus, refetchInterval: 60_000 });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const homeDetail = health?.services.find((s) => s.service === "home")?.detail ?? "demo";

  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-line bg-panel/60 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
          <House size={16} strokeWidth={2.2} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink">Home</span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3">
        <span className="text-[28px] font-semibold tracking-tight text-ink tabular-nums leading-none">
          {formatClock(now)}
        </span>
        <span className="text-sm text-ink-3">{formatDate(now)}</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs text-ink-3">
            <StatusDot tone="ok" />
            <CloudSun size={14} className="text-ink-3" />
          </span>
          <span className="flex items-center gap-2 text-xs text-ink-3">
            <StatusDot tone={homeDetail === "demo" ? "muted" : "ok"} />
            <House size={14} className="text-ink-3" />
            <span className="capitalize">{homeDetail}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-ink-3">
            <StatusDot tone={spotify?.authorized ? "ok" : "muted"} />
            <Music size={14} className="text-ink-3" />
            <span>{spotify?.authorized ? "Spotify" : "demo"}</span>
          </span>
        </div>

        <TouchButton variant="primary" icon={Mic} onClick={() => setVoiceOpen(true)} aria-label="Open voice assistant">
          Assistant
        </TouchButton>
      </div>
    </header>
  );
}
