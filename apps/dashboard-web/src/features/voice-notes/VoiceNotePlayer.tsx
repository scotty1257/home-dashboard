import { useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { TouchButton } from "../../components/TouchButton";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";

interface Props {
  /** Relative audio path served by the API (e.g. /api/voice-notes/<id>/audio). */
  audioUrl: string;
  /** Stable per-note seed for the waveform shape (the note id). */
  seed: string;
  /** Recorded length, shown until playback starts. */
  durationMs?: number;
  /** Fired when playback starts; the tile wires markRead here. */
  onStarted?: () => void;
}

const BAR_COUNT = 28;

/* Deterministic pseudo-random, so a waveform is stable across renders. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A stable bar pattern for one note. No amplitude data is captured at record
 * time, so rather than fake a live meter we derive a fixed silhouette from the
 * note id: every note looks like itself, consistently, across reloads.
 */
function waveform(seedText: string): number[] {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) % 100_000;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    // Taper the ends so it reads as an utterance rather than a block.
    const envelope = Math.sin((Math.PI * (i + 0.5)) / BAR_COUNT) ** 0.6;
    return 0.22 + envelope * (0.25 + seeded(hash + i) * 0.75);
  });
}

/** jsdom (and some browsers) return undefined/reject from play(); never crash. */
function playSafe(audio: HTMLAudioElement) {
  try {
    const maybe = audio.play() as unknown;
    if (maybe instanceof Promise) maybe.catch(() => {});
  } catch {
    // Playback unavailable in this environment — UI state still toggles.
  }
}

/** Big 48px play/pause button + a waveform that fills as the note plays. */
export function VoiceNotePlayer({ audioUrl, seed, durationMs, onStarted }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | undefined>(durationMs);
  const bars = useMemo(() => waveform(seed), [seed]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    playSafe(audio);
    setPlaying(true);
    onStarted?.();
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <TouchButton
        variant={playing ? "soft" : "primary"}
        icon={playing ? Pause : Play}
        iconOnly
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={toggle}
      />
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setRemainingMs(durationMs);
        }}
        onTimeUpdate={(event) => {
          const el = event.currentTarget;
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setProgress(el.currentTime / el.duration);
            setRemainingMs((el.duration - el.currentTime) * 1000);
          }
        }}
      />
      <div aria-hidden className="flex min-w-8 flex-1 items-center gap-[2px]">
        {bars.map((height, i) => {
          const played = i / BAR_COUNT < progress;
          return (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-pill transition-colors duration-150",
                played ? "bg-accent" : "bg-line-strong",
              )}
              style={{ height: `${Math.round(height * 28)}px` }}
            />
          );
        })}
      </div>

      {remainingMs !== undefined && remainingMs > 0 && (
        <span className="shrink-0 text-meta tabular-nums text-ink-3">
          {formatDuration(remainingMs)}
        </span>
      )}
    </div>
  );
}
