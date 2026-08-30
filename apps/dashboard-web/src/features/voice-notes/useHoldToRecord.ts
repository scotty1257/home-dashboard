import { useCallback, useEffect, useRef, useState } from "react";

/** The recorder state machine's discrete states. */
export type RecorderStatus = "idle" | "requesting" | "recording" | "uploading" | "error";

/** Failure kinds surfaced to the UI (mic-denied is recoverable via Retry). */
export type RecorderError = "mic-denied" | "unsupported" | "upload-failed";

export interface HoldToRecordApi {
  status: RecorderStatus;
  error?: RecorderError;
  /** Milliseconds recorded so far; ticks every 100ms while recording. */
  durationMs: number;
  /** pointerdown — request the mic and start recording. */
  start(): Promise<void>;
  /** pointerup — stop recording and upload (unless the press was too short). */
  stop(): void;
  /** pointercancel / pointerleave — discard everything and release the mic. */
  cancel(): void;
}

export interface HoldToRecordOptions {
  /** Receives the assembled recording; the hook manages uploading/error states. */
  upload?: (blob: Blob, mime: string, durationMs: number, transcript?: string) => Promise<void> | void;
  /** Auto-stop at this duration (default 60s — the API's hard cap). */
  maxMs?: number;
  /** Presses shorter than this are discarded as accidental taps (default 300ms). */
  minMs?: number;
}

/** Candidate mime types in preference order (webm first). */
const MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/ogg"] as const;

const TICK_MS = 100;

/** First MediaRecorder-supported mime from the candidate list, or null. */
function pickMimeType(Recorder: typeof MediaRecorder): string | null {
  try {
    for (const mime of MIME_CANDIDATES) {
      if (Recorder.isTypeSupported(mime)) return mime;
    }
  } catch {
    // Some engines throw on isTypeSupported; treat as nothing supported.
  }
  return null;
}

/** Minimal shape of the non-standard webkitSpeechRecognition, used best-effort. */
interface SpeechRecognitionLike {
  continuous?: boolean;
  interimResults?: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

/**
 * Hold-to-record state machine: idle → requesting (mic permission) →
 * recording → uploading → idle, with every exit path releasing the stream
 * tracks. Short presses (< minMs) and cancels discard the take without
 * uploading; the optional webkitSpeechRecognition transcript is strictly
 * best-effort and never blocks the flow.
 */
export function useHoldToRecord(options: HoldToRecordOptions = {}): HoldToRecordApi {
  const { maxMs = 60_000, minMs = 300 } = options;

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<RecorderError | undefined>(undefined);
  const [durationMs, setDurationMs] = useState(0);

  const statusRef = useRef<RecorderStatus>("idle");
  const durationRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRef = useRef(false);
  const stopHandledRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef<string | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Always-current upload callback without rebuilding the state machine.
  const uploadRef = useRef(options.upload);
  useEffect(() => {
    uploadRef.current = options.upload;
  });

  const setStatusBoth = useCallback((next: RecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const releaseTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Best effort — recognition failures never block recording.
    }
    recognitionRef.current = null;
  }, []);

  const resetIdle = useCallback(() => {
    durationRef.current = 0;
    setDurationMs(0);
    setStatusBoth("idle");
  }, [setStatusBoth]);

  /** Assembles the blob and finishes the recording (upload or discard). */
  const finishRecording = useCallback(() => {
    if (stopHandledRef.current) return; // idempotent: recorder.onstop + guards
    stopHandledRef.current = true;
    clearTimer();
    releaseTracks();
    stopRecognition();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    const wasCancelled = cancelRef.current;
    cancelRef.current = false;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const duration = durationRef.current;

    if (wasCancelled || duration < minMs) {
      // Explicit cancel or accidental tap: discard, never upload.
      resetIdle();
      return;
    }

    const mime = recorder?.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    const transcript = transcriptRef.current;
    transcriptRef.current = undefined;
    setStatusBoth("uploading");
    Promise.resolve(uploadRef.current?.(blob, mime, duration, transcript))
      .then(() => resetIdle())
      .catch(() => {
        setError("upload-failed");
        setStatusBoth("error");
      });
  }, [clearTimer, minMs, releaseTracks, resetIdle, setStatusBoth, stopRecognition]);

  const stop = useCallback(() => {
    if (statusRef.current === "requesting") {
      // Release arrived while the permission prompt was still up: treat the
      // whole press as a discard so a stray recording is never left open.
      cancelRef.current = true;
      return;
    }
    if (statusRef.current !== "recording") return; // late pointerup after auto-stop
    const recorder = recorderRef.current;
    if (!recorder) {
      finishRecording();
      return;
    }
    try {
      recorder.stop();
    } catch {
      finishRecording(); // already inactive — finish synchronously
    }
  }, [finishRecording]);

  const cancel = useCallback(() => {
    if (statusRef.current === "requesting") {
      cancelRef.current = true;
      return;
    }
    if (statusRef.current !== "recording") return;
    cancelRef.current = true;
    const recorder = recorderRef.current;
    if (!recorder) {
      finishRecording();
      return;
    }
    try {
      recorder.stop();
    } catch {
      finishRecording();
    }
  }, [finishRecording]);

  const startRecognition = useCallback(() => {
    try {
      const Ctor = (
        window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }
      ).webkitSpeechRecognition;
      if (!Ctor) return;
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result?.[0]?.transcript;
          if (result?.isFinal && text) {
            transcriptRef.current = `${transcriptRef.current ?? ""} ${text}`.trim();
          }
        }
      };
      recognition.onerror = () => {};
      recognition.onend = () => {};
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Transcript is strictly best-effort; recording works without it.
    }
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current !== "idle" && statusRef.current !== "error") return; // busy; 'error' retries
    setError(undefined);
    setStatusBoth("requesting");
    cancelRef.current = false;
    try {
      const devices = navigator.mediaDevices;
      if (!devices?.getUserMedia) {
        throw Object.assign(new Error("getUserMedia unavailable"), { name: "NotFoundError" });
      }
      const stream = await devices.getUserMedia({ audio: true });
      streamRef.current = stream;
      if (cancelRef.current) {
        // pointerup/cancel arrived while the permission prompt was up.
        releaseTracks();
        resetIdle();
        return;
      }
      const Recorder = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
      const mime = Recorder ? pickMimeType(Recorder) : null;
      if (!Recorder || !mime) {
        releaseTracks();
        setError("unsupported");
        setStatusBoth("error");
        return;
      }
      const recorder = new Recorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      chunksRef.current = [];
      stopHandledRef.current = false;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => finishRecording();
      recorder.start();
      startRecognition();
      durationRef.current = 0;
      setDurationMs(0);
      setStatusBoth("recording");
      timerRef.current = window.setInterval(() => {
        durationRef.current += TICK_MS;
        setDurationMs(durationRef.current);
        if (durationRef.current >= maxMs) stop(); // 60s auto-stop
      }, TICK_MS);
    } catch (err) {
      releaseTracks();
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        setError("mic-denied");
      } else {
        setError("unsupported");
      }
      setStatusBoth("error");
    }
  }, [finishRecording, maxMs, releaseTracks, resetIdle, setStatusBoth, startRecognition, stop]);

  // Unmount during a recording cancels it: discard, release, never upload.
  useEffect(() => {
    return () => {
      clearTimer();
      cancelRef.current = true;
      try {
        recorderRef.current?.stop();
      } catch {
        // Already inactive — nothing to finish.
      }
      releaseTracks();
      stopRecognition();
    };
  }, [clearTimer, releaseTracks, stopRecognition]);

  return { status, error, durationMs, start, stop, cancel };
}
