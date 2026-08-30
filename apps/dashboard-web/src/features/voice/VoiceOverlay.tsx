import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mic, Send, X, Loader2, Volume2, AlertTriangle, HelpCircle, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { TouchButton } from "../../components/TouchButton";
import { useVoiceStore } from "../../lib/store";
import { cn } from "../../lib/cn";

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
    mutationFn: ({ text, confirm }: { text: string; confirm: boolean }) => api.voiceSession(text, confirm),
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
    if (!SpeechRecognition) return;
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

  const state = session.isPending && !turn?.requiresConfirmation ? "thinking" : (turn?.state ?? "idle");
  const StateIcon = stateIcon(state);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/60 px-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Voice assistant"
    >
      <button
        className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-md border border-line bg-panel text-ink-3 transition-colors hover:text-ink"
        onClick={() => setOpen(false)}
        aria-label="Close"
      >
        <X size={20} />
      </button>

      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            "flex h-24 w-24 items-center justify-center rounded-full border border-line bg-panel text-accent",
            state === "listening" && "animate-[pulse_1.4s_ease-in-out_infinite] border-accent/40",
            state === "speaking" && "text-teal",
            state === "error" && "text-danger",
          )}
        >
          {state === "thinking" ? (
            <Loader2 size={36} className="animate-spin" />
          ) : (
            <StateIcon size={36} strokeWidth={1.75} />
          )}
        </div>
        <span className="text-base font-medium text-ink">{stateLabel(state)}</span>
      </div>

      {turn?.transcript && <div className="max-w-xl text-center text-sm italic text-ink-2">“{turn.transcript}”</div>}
      {turn?.reply && <div className="max-w-2xl text-center text-2xl font-semibold leading-snug text-ink">{turn.reply}</div>}

      {turn?.requiresConfirmation && (
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-medium text-warning">This action needs your OK.</span>
          <div className="flex gap-3">
            <TouchButton variant="primary" icon={HelpCircle} onClick={() => submit(lastText, true)}>
              Confirm
            </TouchButton>
            <TouchButton variant="ghost" onClick={() => setTurn(null)}>Cancel</TouchButton>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-xl items-center gap-2">
        <input
          className="h-12 flex-1 rounded-md border border-line-strong bg-panel px-4 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(input)}
          placeholder="Ask anything — weather, calendar, lights, music…"
          aria-label="Ask the assistant"
        />
        <TouchButton variant="soft" icon={Mic} iconOnly onClick={startListening} disabled={session.isPending} aria-label="Talk" />
        <TouchButton variant="primary" icon={Send} iconOnly onClick={() => submit(input)} disabled={session.isPending} aria-label="Send" />
      </div>

      {!SpeechRecognition && (
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Sparkles size={13} /> Voice input needs Chrome — type instead.
        </div>
      )}
    </div>
  );
}

function stateIcon(state: string) {
  switch (state) {
    case "listening":
      return Mic;
    case "speaking":
      return Volume2;
    case "confirming":
      return HelpCircle;
    case "error":
      return AlertTriangle;
    default:
      return Sparkles;
  }
}

function stateLabel(state: string): string {
  switch (state) {
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "speaking":
      return "Speaking";
    case "confirming":
      return "Confirm";
    case "error":
      return "Something went wrong";
    default:
      return "How can I help?";
  }
}
