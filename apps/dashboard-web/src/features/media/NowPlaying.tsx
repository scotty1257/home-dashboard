import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { formatDuration } from "../../lib/format";
import "./NowPlaying.css";

export function NowPlaying() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["media"], queryFn: api.media, refetchInterval: 10_000 });

  const command = useMutation({
    mutationFn: api.mediaCommand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });

  if (!data) {
    return (
      <Panel title="Now Playing" icon="🎵" accent="teal">
        <div className="np-empty">Nothing playing</div>
      </Panel>
    );
  }

  const { track, isPlaying, progressMs, volume, devices } = data;
  const progress = track ? Math.min(1, progressMs / track.durationMs) : 0;

  return (
    <Panel
      title={data.connected ? "Now Playing" : "Music (offline)"}
      icon="🎵"
      accent="teal"
      actions={
        <span className="np-source">{data.source === "demo" ? "demo" : "Spotify"}</span>
      }
    >
      <div className="np-body">
        <div className="np-art">
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" />
          ) : (
            <div className="np-art__placeholder">♪</div>
          )}
        </div>
        <div className="np-info">
          <div className="np-track">{track?.name ?? "Nothing playing"}</div>
          <div className="np-artist">{track?.artists.join(", ") ?? "—"}</div>
          <div className="np-album">{track?.album}</div>

          <div className="np-progress">
            <div className="np-progress__bar">
              <div className="np-progress__fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="np-progress__times">
              <span>{formatDuration(progressMs)}</span>
              <span>{track ? formatDuration(track.durationMs) : "0:00"}</span>
            </div>
          </div>

          <div className="np-controls">
            <TouchButton variant="ghost" icon="⏮" aria-label="Previous" onClick={() => command.mutate({ action: "previous" })} />
            <TouchButton
              variant="primary"
              icon={isPlaying ? "⏸" : "▶"}
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={() => command.mutate({ action: isPlaying ? "pause" : "play" })}
            />
            <TouchButton variant="ghost" icon="⏭" aria-label="Next" onClick={() => command.mutate({ action: "next" })} />
          </div>

          <div className="np-volume">
            <span className="np-volume__icon">🔊</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => command.mutate({ action: "setVolume", volume: Number(e.target.value) })}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
      {devices.length > 0 && (
        <div className="np-devices">
          {devices.slice(0, 3).map((d) => (
            <span key={d.id} className={`np-device ${d.isActive ? "np-device--active" : ""}`}>
              {d.name}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
