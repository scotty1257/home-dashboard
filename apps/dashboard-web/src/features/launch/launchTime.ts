import { useEffect, useState } from "react";

/** Shared 1s "now" ticker so countdowns stay live without prop plumbing. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 'Bus in 6 min' countdown label from a departure instant ('Now' once due). */
export function launchCountdown(departureAt: string, now: number): string {
  const msLeft = new Date(departureAt).getTime() - now;
  if (msLeft <= 0) return "Now";
  const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
  return `Bus in ${minutes} min`;
}
