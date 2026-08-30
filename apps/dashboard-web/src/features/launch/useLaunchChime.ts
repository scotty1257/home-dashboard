import { useCallback, useEffect, useRef, useState } from "react";
import type { LaunchRun, LaunchTemplate } from "@home-dashboard/contracts";

/** The chime state machine's discrete states. */
export type LaunchChimeState = "idle" | "armed" | "played" | "blocked";

export interface LaunchChimeOptions {
  run: LaunchRun | null;
  template: LaunchTemplate | null;
  /**
   * Persists chimePlayedAt server-side so reloads and re-entry never chime
   * again for the same run.
   */
  ack: () => Promise<void>;
}

export interface LaunchChimeApi {
  chimeState: LaunchChimeState;
  /** Blocked → tap flow: resume the context on a user gesture, then play + ack. */
  enableChime: () => void;
}

const MINUTE_MS = 60_000;
/** Server default when the template is unknown; matches the contract default. */
const DEFAULT_CHIME_BEFORE_MINUTES = 3;
/** Each tone is ~180ms (880Hz then 1320Hz). */
const TONE_S = 0.18;
/** Close the context once both tones have finished, plus a small tail. */
const CLOSE_AFTER_MS = 700;

/** Server-identical chime gate: unacked, run active, at/past departure - lead. */
function shouldChime(run: LaunchRun | null, leadMinutes: number, now: number): boolean {
  if (!run || run.chimePlayedAt != null) return false;
  if (run.status !== "active") return false;
  return now >= new Date(run.departureAt).getTime() - leadMinutes * MINUTE_MS;
}

function initialChimeState(run: LaunchRun | null): LaunchChimeState {
  if (!run || run.chimePlayedAt != null || run.status !== "active") return "idle";
  return "armed";
}

/** Schedules the short two-tone chime (~880Hz then ~1320Hz, gentle envelope). */
function scheduleTones(ctx: AudioContext): void {
  const t0 = ctx.currentTime + 0.02;
  tone(ctx, 880, t0);
  tone(ctx, 1320, t0 + TONE_S);
}

function tone(ctx: AudioContext, frequency: number, at: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, at);
  // Gentle attack/decay so the chime never pops.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + TONE_S);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + TONE_S + 0.04);
}

/**
 * Departure chime for the launch screen. Arms whenever the current run is
 * active and unacked, polls on a 1s interval, and attempts the chime the
 * moment the countdown enters the template's chime lead-up (or immediately on
 * entry if it is already inside the window).
 *
 * Autoplay policy can leave a fresh AudioContext 'suspended'; when resume()
 * rejects (or never reaches 'running') the hook goes 'blocked' and NEVER acks
 * — the UI surfaces a tap target whose gesture calls enableChime() to resume
 * the same context, play, and ack. On success the ack fires immediately after
 * the tones are scheduled: the server persists chimePlayedAt, so reloads see
 * it set and this hook stays 'idle' forever after.
 */
export function useLaunchChime(options: LaunchChimeOptions): LaunchChimeApi {
  const [chimeState, setChimeState] = useState<LaunchChimeState>(() => initialChimeState(options.run));

  const stateRef = useRef<LaunchChimeState>(chimeState);
  const optionsRef = useRef(options);
  const ctxRef = useRef<AudioContext | null>(null);
  const attemptingRef = useRef(false);

  // Always-current options without re-arming the state machine.
  useEffect(() => {
    optionsRef.current = options;
  });

  const setStateBoth = useCallback((next: LaunchChimeState) => {
    stateRef.current = next;
    setChimeState(next);
  }, []);

  const closeContext = useCallback(() => {
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (!ctx) return;
    try {
      const settled = ctx.close();
      if (settled && typeof settled.catch === "function") settled.catch(() => {});
    } catch {
      // Already closed or unsupported — nothing to release.
    }
  }, []);

  const attemptPlay = useCallback(
    async (fromGesture: boolean) => {
      if (attemptingRef.current) return;
      const s = stateRef.current;
      // The poll only drives the armed state; blocked retries are explicit.
      if (s !== "armed" && !(fromGesture && s === "blocked")) return;
      attemptingRef.current = true;
      try {
        const Ctor = globalThis.AudioContext;
        if (!Ctor) {
          setStateBoth("blocked");
          return;
        }
        let ctx = ctxRef.current;
        if (!ctx) {
          ctx = new Ctor();
          ctxRef.current = ctx;
        }
        if (ctx.state !== "running") {
          await ctx.resume();
        }
        if (ctx.state !== "running") {
          // Autoplay block: never ack, wait for the user-gesture tap.
          setStateBoth("blocked");
          return;
        }
        scheduleTones(ctx);
        setStateBoth("played");
        // Ack IMMEDIATELY after the successful start — the server persists
        // chimePlayedAt, so reloads never chime again for this run.
        try {
          await optionsRef.current.ack();
        } catch {
          // Ack transport failure must not re-trigger the chime.
        }
        window.setTimeout(closeContext, CLOSE_AFTER_MS);
      } catch {
        setStateBoth("blocked");
      } finally {
        attemptingRef.current = false;
      }
    },
    [closeContext, setStateBoth],
  );

  const runId = options.run?.id ?? null;

  // (Re)arm when the run identity changes; if the run is already inside the
  // chime window on entry, attempt immediately instead of waiting a tick.
  useEffect(() => {
    const o = optionsRef.current;
    setStateBoth(initialChimeState(o.run));
    // A context left from a previous run is useless — release it.
    closeContext();
    const lead = o.template?.chimeBeforeMinutes ?? DEFAULT_CHIME_BEFORE_MINUTES;
    if (stateRef.current === "armed" && shouldChime(o.run, lead, Date.now())) {
      void attemptPlay(false);
    }
  }, [runId, attemptPlay, closeContext, setStateBoth]);

  // Poll for the threshold crossing while armed.
  useEffect(() => {
    const tick = () => {
      if (stateRef.current !== "armed") return;
      const o = optionsRef.current;
      const lead = o.template?.chimeBeforeMinutes ?? DEFAULT_CHIME_BEFORE_MINUTES;
      if (shouldChime(o.run, lead, Date.now())) void attemptPlay(false);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attemptPlay]);

  const enableChime = useCallback(() => {
    void attemptPlay(true);
  }, [attemptPlay]);

  // Unmount releases any context we still hold.
  useEffect(() => closeContext, [closeContext]);

  return { chimeState, enableChime };
}
