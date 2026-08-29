import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { TouchButton } from "../../components/TouchButton";
import { useVoiceStore } from "../../lib/store";
import "./VoiceOverlay.css";

type Turn = {
  state: string;
  transcript?: string;
  reply?: string;
  requiresConfirmation: boolean;
  risk: string;
};

const SpeechRecognition =
  (window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any })
    .webkitSpeechRecognition ?? (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition;

export function VoiceOverlay() {
  const open = useVoiceStore((s) => s.open);
  const setOpen = useVoiceStore((s) => s.setOpen);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [lastText, setLastText] = useState("");
  const [turn, setTurn] = useState<Turn | null>(null);
  const recognitionRef = useRef<any>(null);

  const session = useMutation({
    mutationFn: ({ text, confirm }: { text: string; confirm: boolean }) =>
      api.voiceSession(text, confirm),
    onSuccess: (data) => {
      setTurn(data);
      if (data.reply) speak(data.reply);
    },
    onError: () => {
      setTurn({ state: "error", requiresConfirmation: false, risk: "read-only", reply: "Sorry, I couldn't reach the assistant." });
    },
  });

  useEffect(() => {
    if (!open) {
      setTurn(null);
      setInput("");
      setListening(false);
    }
  }, [open]);

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* no-op */
    }
  };

  const submit = (text: string, confirm = false) => {
    const t = text.trim();
    if (!t) return;
    setLastText(t);
    setTurn({ state: "thinking", requiresConfirmation: false, risk: "read-only" });
    session.mutate({ text: t, confirm });
  };

  const startListening = () => {
    if (!SpeechRecognition) {
      // Fall back to text input only.
      setListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    recognitionRef.current = rec;
    setListening(true);
    setTurn({ state: "listening", requiresConfirmation: false, risk: "read-only" });
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript as string;
      setListening(false);
      setInput(text);
      submit(text);
    };
    rec.onerror = () => {
      setListening(false);
      setTurn({ state: "idle", requiresConfirmation: false, risk: "read-only" });
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  if (!open) return null;

  const state = session.isPending && !turn?.requiresConfirmation ? "thinking" : turn?.state ?? "idle";

  return (
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Voice assistant">
      <div className="voice-orb-wrap">
        <div className={`voice-orb voice-orb--${state}`}>
          <span className="voice-orb__glyph">{orbGlyph(state)}</span>
        </div>
        <div className="voice-orb__label">{stateLabel(state)}</div>
      </div>

      {turn?.transcript && <div className="voice-transcript">“{turn.transcript}”</div>}
      {turn?.reply && <div className="voice-reply">{turn.reply}</div>}

      {turn?.requiresConfirmation && (
        <div className="voice-confirm">
          <span className="voice-confirm__note">This action needs your OK.</span>
          <div className="voice-confirm__actions">
            <TouchButton variant="danger" onClick={() => submit(lastText, true)}>Confirm</TouchButton>
            <TouchButton variant="ghost" onClick={() => setTurn(null)}>Cancel</TouchButton>
          </div>
        </div>
      )}

      <div className="voice-input-row">
        <input
          className="voice-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(input)}
          placeholder="Ask anything — 'what's the weather', 'turn off the lights'…"
          aria-label="Ask the assistant"
        />
        <TouchButton
          variant="primary"
          icon="🎤"
          aria-label="Talk"
          onClick={startListening}
          disabled={session.isPending}
        />
        <TouchButton variant="soft" icon="➤" aria-label="Send" onClick={() => submit(input)} disabled={session.isPending} />
      </div>

      {!SpeechRecognition && (
        <div className="voice-note">Voice input needs Chrome; type instead.</div>
      )}

      <button className="voice-close" onClick={setOpen.bind(null, false)} aria-label="Close">✕</button>
    </div>
  );
}

function orbGlyph(state: string): string {
  switch (state) {
    case "listening": return "🎙️";
    case "thinking": return "…";
    case "speaking": return "💬";
    case "confirming": return "❓";
    case "error": return "⚠️";
    default: return "✦";
  }
}

function stateLabel(state: string): string {
  switch (state) {
    case "listening": return "Listening…";
    case "thinking": return "Thinking…";
    case "speaking": return "Speaking";
    case "confirming": return "Confirm";
    case "error": return "Something went wrong";
    default: return "Tap to talk";
  }
}
