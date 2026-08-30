import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { TouchButton } from "../../components/TouchButton";

interface Props {
  /** Relative audio path served by the API (e.g. /api/voice-notes/<id>/audio). */
  audioUrl: string;
  /** Fired when playback starts; the tile wires markRead here. */
  onStarted?: () => void;
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

/** Big 48px play/pause button + progress bar for one voice note. */
export function VoiceNotePlayer({ audioUrl, onStarted }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

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
        }}
        onTimeUpdate={(event) => {
          const el = event.currentTarget;
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setProgress(el.currentTime / el.duration);
          }
        }}
      />
      <div aria-hidden className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-100"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
