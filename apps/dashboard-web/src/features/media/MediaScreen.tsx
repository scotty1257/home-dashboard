import { Play, Pause, SkipBack, SkipForward, Volume2, Music2, Shuffle, Repeat } from "lucide-react";
import type { CSSProperties } from "react";
import { TouchButton } from "../../components/TouchButton";
import { RangeControl } from "../../components/RangeControl";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";
import { usePlayer, useSmoothProgress } from "./usePlayer";

/**
 * Full-screen player.
 *
 * Two columns at wide sizes: art on the left, everything you operate on the
 * right. Stacked vertically the art pushed the transport controls off the
 * bottom of a 1080p screen and they were simply unreachable — the art is now
 * bounded by the column rather than driving the page height. Below 2xl it
 * falls back to the stacked layout, where there is room to scroll.
 */
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
    <div
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-8",
        "2xl:flex-row 2xl:items-center 2xl:justify-center 2xl:gap-12",
      )}
    >
      {/* Album art + glow. `overflow-hidden` with padding keeps the bloom
          around the art instead of letting blur-3xl tint the text column. */}
      <div className="relative flex shrink-0 items-center justify-center overflow-hidden p-8">
        <div
          className="absolute h-[130%] w-[130%] rounded-pill opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-teal) 0%, var(--color-indigo) 45%, transparent 70%)", animation: "artGlow 8s ease-in-out infinite" } as CSSProperties}
          aria-hidden
        />
        <div className="relative flex aspect-square h-[min(42vh,22rem)] items-center justify-center overflow-hidden rounded-panel border border-white/10 shadow-2xl 2xl:h-[min(62vh,32rem)]">
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal via-indigo to-violet">
              <Music2 size={96} strokeWidth={1.25} className="text-white/85" />
            </div>
          )}
        </div>
      </div>

      {/* Everything you operate, in one column beside the art. */}
      <div className="flex w-full min-w-0 max-w-2xl flex-col items-center gap-6 rounded-xl border border-line bg-panel p-6 backdrop-blur-md 2xl:items-start">
      {/* Track info */}
      <div className="flex w-full flex-col items-center gap-1 text-center 2xl:items-start 2xl:text-left">
        <h1 className="w-full truncate text-display font-bold tracking-tight text-ink 2xl:text-hero">
          {track?.name ?? "Nothing playing"}
        </h1>
        <p className="text-metric text-ink-2">{track?.artists.join(", ") ?? "—"}</p>
        <p className="text-body text-ink-4">{track?.album}</p>
      </div>

      {/* Progress */}
      <div className="w-full">
        <div className="h-2 w-full overflow-hidden rounded-pill bg-surface">
          <div className="h-full rounded-pill bg-gradient-to-r from-teal to-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-body tabular-nums text-ink-3">
          <span>{formatDuration(elapsedMs)}</span>
          <span>{track ? formatDuration(track.durationMs) : "0:00"}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex w-full items-center justify-center gap-6 2xl:justify-start">
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
      <div className="flex w-full flex-col gap-4">
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
          <div className="flex flex-wrap justify-center gap-2 2xl:justify-start">
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => command.mutate({ action: "transfer", deviceId: d.id })}
                className={cn(
                  "min-h-touch rounded-pill px-5 text-body font-medium transition-colors",
                  d.isActive
                    ? "bg-accent-soft text-accent-ink ring-1 ring-accent/40"
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
    </div>
  );
}
