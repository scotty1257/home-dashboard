import { Play, Pause, SkipBack, SkipForward, Volume2, Music2, Shuffle, Repeat, Repeat1 } from "lucide-react";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { RangeControl } from "../../components/RangeControl";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";
import { usePlayer, useSmoothProgress } from "./usePlayer";

/** The dashboard's music player: compact album art, scrubber, and transport. */
export function NowPlaying() {
  const { state: data, command } = usePlayer();
  const track = data?.track ?? null;
  const isPlaying = data?.isPlaying ?? false;
  const elapsedMs = useSmoothProgress(data?.progressMs ?? 0, isPlaying, track?.durationMs);

  if (!data) {
    return (
      <Panel title="Now Playing" accent="teal">
        <div className="py-8 text-center text-body text-ink-3">Nothing playing</div>
      </Panel>
    );
  }

  const { volume } = data;
  const progress = track ? Math.min(1, elapsedMs / track.durationMs) : 0;

  const repeat = data.repeat;
  const RepeatIcon = repeat === "track" ? Repeat1 : Repeat;

  // Compact tile: art on the left, track + scrubber + transport to the right,
  // so the whole thing fills one grid cell without a swath of dead space.
  return (
    <Panel
      title="Now Playing"
      accent="teal"
      className="overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col justify-center"
      actions={
        <span className="text-meta font-medium text-ink-4">
          {data.source === "demo" ? "demo" : "Spotify"}
        </span>
      }
    >
      <div className="flex min-h-0 items-center gap-5">
        {/* Album art with the same breathing glow as the media screen. */}
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute -inset-3 rounded-full bg-[radial-gradient(circle,var(--color-teal)_0%,transparent_65%)] opacity-40 blur-2xl animate-[artGlow_8s_ease-in-out_infinite]"
          />
          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl shadow-panel">
            <div
              className="absolute inset-0 bg-gradient-to-br from-teal/70 via-indigo/70 to-violet/70"
              aria-hidden
            />
            {track?.artworkUrl ? (
              <img src={track.artworkUrl} alt="" className="relative h-full w-full object-cover" />
            ) : (
              <Music2 size={40} strokeWidth={1.5} className="relative text-white/90" />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate text-countdown font-semibold tracking-tight text-ink">
              {track?.name ?? "Nothing playing"}
            </div>
            <div className="truncate text-body text-ink-2">{track?.artists.join(", ") ?? "—"}</div>
            {track?.album && <div className="truncate text-meta text-ink-3">{track.album}</div>}
          </div>

          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal to-accent transition-[width] duration-500 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-meta tabular-nums text-ink-4">
              <span>{formatDuration(elapsedMs)}</span>
              <span>{track ? formatDuration(track.durationMs) : "0:00"}</span>
            </div>
          </div>

          {/* Transport: shuffle / prev / play / next / repeat, then volume. */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              <TouchButton
                variant={data.shuffle ? "soft" : "ghost"}
                icon={Shuffle}
                iconOnly
                onClick={() => command.mutate({ action: "setShuffle", enabled: !data.shuffle })}
                aria-label={data.shuffle ? "Shuffle on" : "Shuffle off"}
              />
              <TouchButton
                variant="ghost"
                icon={SkipBack}
                iconOnly
                onClick={() => command.mutate({ action: "previous" })}
                aria-label="Previous"
              />
              <TouchButton
                variant="primary"
                icon={isPlaying ? Pause : Play}
                iconOnly
                onClick={() => command.mutate({ action: isPlaying ? "pause" : "play" })}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="h-14 w-14"
              />
              <TouchButton
                variant="ghost"
                icon={SkipForward}
                iconOnly
                onClick={() => command.mutate({ action: "next" })}
                aria-label="Next"
              />
              <TouchButton
                variant={repeat === "off" ? "ghost" : "soft"}
                icon={RepeatIcon}
                iconOnly
                onClick={() =>
                  command.mutate({
                    action: "setRepeat",
                    mode: repeat === "off" ? "context" : repeat === "context" ? "track" : "off",
                  })
                }
                aria-label={`Repeat ${repeat}`}
              />
            </div>

            <div className="flex min-w-[160px] flex-1 items-center gap-3">
              <Volume2 size={18} className="shrink-0 text-ink-3" />
              <RangeControl
                min={0}
                max={100}
                value={volume}
                onChange={(v) => command.mutate({ action: "setVolume", volume: v })}
                aria-label="Volume"
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
