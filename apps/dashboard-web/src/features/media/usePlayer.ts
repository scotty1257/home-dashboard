import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

/** Shared playback state + controls for the compact and full-screen players. */
export function usePlayer() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["media"], queryFn: api.media, refetchInterval: 10_000 });
  const command = useMutation({
    mutationFn: api.mediaCommand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
  return { state: data, command };
}

/**
 * Playback position in ms, advanced locally between polls. The server is only
 * asked every 10s, so the raw `progressMs` would visibly jump; this ticks it
 * forward while playing and re-syncs whenever a fresh value arrives.
 */
export function useSmoothProgress(
  progressMs: number,
  isPlaying: boolean,
  durationMs: number | undefined,
): number {
  const [elapsed, setElapsed] = useState(progressMs);

  // Re-sync on every poll (and on seek/skip).
  useEffect(() => setElapsed(progressMs), [progressMs]);

  useEffect(() => {
    if (!isPlaying) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const next = progressMs + (Date.now() - startedAt);
      setElapsed(durationMs ? Math.min(next, durationMs) : next);
    }, 500);
    return () => window.clearInterval(id);
  }, [progressMs, isPlaying, durationMs]);

  return elapsed;
}
