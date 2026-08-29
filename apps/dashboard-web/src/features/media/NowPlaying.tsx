import { Play, Pause, SkipBack, SkipForward, Volume2, Music2 } from "lucide-react";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";
import { usePlayer } from "./usePlayer";

/** Compact-but-large player for the overview rail. */
export function NowPlaying() {
  const { state: data, command } = usePlayer();

  if (!data) {
    return (
      <Panel title="Now Playing" accent="teal">
        <div className="py-8 text-center text-sm text-ink-3">Nothing playing</div>
      </Panel>
    );
  }

  const { track, isPlaying, progressMs, volume } = data;
  const progress = track ? Math.min(1, progressMs / track.durationMs) : 0;

  return (
    <Panel
      title="Now Playing"
      accent="teal"
      actions={
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-4">
          {data.source === "demo" ? "demo" : "Spotify"}
        </span>
      }
    >
      <div className="flex gap-5">
        <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          <div
            className="absolute inset-0 bg-gradient-to-br from-teal/60 via-indigo/60 to-violet/60"
            aria-hidden
          />
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" className="relative h-full w-full object-cover" />
          ) : (
            <Music2 size={40} className="relative text-white/85" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-lg font-semibold text-ink">{track?.name ?? "Nothing playing"}</div>
          <div className="truncate text-sm text-ink-2">{track?.artists.join(", ") ?? "—"}</div>
          <div className="truncate text-xs text-ink-3">{track?.album}</div>

          <div className="mt-auto">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-gradient-to-r from-teal to-accent" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-ink-4">
              <span>{formatDuration(progressMs)}</span>
              <span>{track ? formatDuration(track.durationMs) : "0:00"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <TouchButton variant="ghost" icon={SkipBack} iconOnly onClick={() => command.mutate({ action: "previous" })} aria-label="Previous" />
        <TouchButton
          variant="primary"
          icon={isPlaying ? Pause : Play}
          iconOnly
          onClick={() => command.mutate({ action: isPlaying ? "pause" : "play" })}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="h-14 w-14"
        />
        <TouchButton variant="ghost" icon={SkipForward} iconOnly onClick={() => command.mutate({ action: "next" })} aria-label="Next" />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Volume2 size={16} className="shrink-0 text-ink-3" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => command.mutate({ action: "setVolume", volume: Number(e.target.value) })}
          className="w-full"
          aria-label="Volume"
        />
      </div>

      {data.devices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.devices.slice(0, 3).map((d) => (
            <span
              key={d.id}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                d.isActive ? "bg-accent-soft text-accent" : "bg-surface text-ink-3",
              )}
            >
              {d.name}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
