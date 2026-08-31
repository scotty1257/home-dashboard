import { Play, Pause, SkipBack, SkipForward, Volume2, Music2, Shuffle, Repeat } from "lucide-react";
import type { CSSProperties } from "react";
import { TouchButton } from "../../components/TouchButton";
import { RangeControl } from "../../components/RangeControl";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";
import { usePlayer, useSmoothProgress } from "./usePlayer";

/** Full-screen player: large album art with a glow, dominant controls. */
export function MediaScreen() {
  const { state: data, command } = usePlayer();

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-3">
          <Music2 size={48} strokeWidth={1.5} />
          <span className="text-body">Nothing playing</span>
        </div>
      </div>
    );
  }

  const { track, isPlaying, progressMs, volume, shuffle, repeat, devices } = data;
  // Same smoothing as the compact tile: media is polled every 10s, so a raw
  // progressMs makes the scrubber jump a tenth of a track at a time.
  const elapsedMs = useSmoothProgress(progressMs, isPlaying, track?.durationMs);
  const progress = track ? Math.min(1, elapsedMs / track.durationMs) : 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      {/* Album art + glow */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute h-[130%] w-[130%] rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-teal) 0%, var(--color-indigo) 45%, transparent 70%)", animation: "artGlow 8s ease-in-out infinite" } as CSSProperties}
          aria-hidden
        />
        <div className="relative flex aspect-square h-[min(52vh,26rem)] items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal via-indigo to-violet">
              <Music2 size={96} strokeWidth={1.25} className="text-white/85" />
            </div>
          )}
        </div>
      </div>

      {/* Track info */}
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="max-w-2xl truncate text-hero font-bold tracking-tight text-ink">
          {track?.name ?? "Nothing playing"}
        </h1>
        <p className="text-metric text-ink-2">{track?.artists.join(", ") ?? "—"}</p>
        <p className="text-body text-ink-4">{track?.album}</p>
      </div>

      {/* Progress */}
      <div className="w-full max-w-2xl">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-gradient-to-r from-teal to-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-body tabular-nums text-ink-3">
          <span>{formatDuration(elapsedMs)}</span>
          <span>{track ? formatDuration(track.durationMs) : "0:00"}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <TouchButton
          variant="ghost"
          icon={Shuffle}
          iconOnly
          className={cn("h-14 w-14", shuffle && "text-accent")}
          onClick={() => command.mutate({ action: "setShuffle", enabled: !shuffle })}
          aria-label="Shuffle"
        />
        <TouchButton variant="ghost" icon={SkipBack} iconOnly className="h-16 w-16" onClick={() => command.mutate({ action: "previous" })} aria-label="Previous" />
        <TouchButton
          variant="primary"
          icon={isPlaying ? Pause : Play}
          iconOnly
          className="h-24 w-24 [&>svg]:h-10 [&>svg]:w-10"
          onClick={() => command.mutate({ action: isPlaying ? "pause" : "play" })}
          aria-label={isPlaying ? "Pause" : "Play"}
        />
        <TouchButton variant="ghost" icon={SkipForward} iconOnly className="h-16 w-16" onClick={() => command.mutate({ action: "next" })} aria-label="Next" />
        <TouchButton
          variant="ghost"
          icon={Repeat}
          iconOnly
          className={cn("h-14 w-14", repeat !== "off" && "text-accent")}
          onClick={() => command.mutate({ action: "setRepeat", mode: repeat === "off" ? "context" : "off" })}
          aria-label="Repeat"
        />
      </div>

      {/* Volume + devices */}
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Volume2 size={20} className="shrink-0 text-ink-3" />
          <RangeControl
            min={0}
            max={100}
            value={volume}
            onChange={(v) => command.mutate({ action: "setVolume", volume: v })}
            aria-label="Volume"
          />
        </div>

        {devices.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => command.mutate({ action: "transfer", deviceId: d.id })}
                className={cn(
                  "rounded-lg px-3 py-2 text-body font-medium transition-colors",
                  d.isActive
                    ? "bg-accent-soft text-accent ring-1 ring-accent/40"
                    : "bg-surface text-ink-3 hover:bg-raised",
                )}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
