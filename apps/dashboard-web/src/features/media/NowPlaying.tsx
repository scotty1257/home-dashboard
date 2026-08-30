import { Play, Pause, SkipBack, SkipForward, Volume2, Music2 } from "lucide-react";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { RangeControl } from "../../components/RangeControl";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";
import { usePlayer } from "./usePlayer";

interface Props {
  /**
   * Rail variant for the Today context column: 64px art, one row with inline
   * transport controls, no volume slider and no device chips.
   */
  compact?: boolean;
}

/** Compact-but-large player for the overview rail. */
export function NowPlaying({ compact = false }: Props) {
  const { state: data, command } = usePlayer();

  if (!data) {
    return (
      <Panel title="Now Playing" accent="teal" density={compact ? "compact" : "default"}>
        <div className={cn("text-center text-sm text-ink-3", compact ? "py-3" : "py-8")}>
          Nothing playing
        </div>
      </Panel>
    );
  }

  const { track, isPlaying, progressMs, volume } = data;
  const progress = track ? Math.min(1, progressMs / track.durationMs) : 0;

  if (compact) {
    // One row: 64px art, track info, inline prev/play/next. No chips, no volume.
    return (
      <Panel title="Now Playing" accent="teal" density="compact" bodyClassName="pb-2 pt-0">
        <div className="flex items-center gap-3">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <div
              className="absolute inset-0 bg-gradient-to-br from-teal/60 via-indigo/60 to-violet/60"
              aria-hidden
            />
            {track?.artworkUrl ? (
              <img src={track.artworkUrl} alt="" className="relative h-full w-full object-cover" />
            ) : (
              <Music2 size={24} className="relative text-white/85" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="truncate text-sm font-semibold text-ink">{track?.name ?? "Nothing playing"}</div>
            <div className="truncate text-xs text-ink-3">{track?.artists.join(", ") ?? "—"}</div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal to-accent"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <TouchButton
              variant="ghost"
              icon={SkipBack}
              iconOnly
              onClick={() => command.mutate({ action: "previous" })}
              aria-label="Previous"
              className="h-12 w-12"
            />
            <TouchButton
              variant="primary"
              icon={isPlaying ? Pause : Play}
              iconOnly
              onClick={() => command.mutate({ action: isPlaying ? "pause" : "play" })}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-12 w-12"
            />
            <TouchButton
              variant="ghost"
              icon={SkipForward}
              iconOnly
              onClick={() => command.mutate({ action: "next" })}
              aria-label="Next"
              className="h-12 w-12"
            />
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Now Playing"
      accent="teal"
      actions={
        <span className="text-xs font-medium uppercase tracking-wide text-ink-4">
          {data.source === "demo" ? "demo" : "Spotify"}
        </span>
      }
    >
      <div className="flex gap-6">
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
            <div className="mt-1.5 flex justify-between text-xs tabular-nums text-ink-4">
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
        <RangeControl
          min={0}
          max={100}
          value={volume}
          onChange={(v) => command.mutate({ action: "setVolume", volume: v })}
          aria-label="Volume"
        />
      </div>

      {data.devices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.devices.slice(0, 3).map((d) => (
            <span
              key={d.id}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
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
