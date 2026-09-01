import { useEffect, useState } from "react";

/**
 * The current time, re-rendered on an interval.
 *
 * The kiosk is always on, so the "now" line and the live-event highlight would
 * otherwise sit wherever they were when the tab was opened. A minute is fine
 * resolution for a wall display, and cheaper than a per-second tick that
 * re-lays out the whole grid.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Align the first tick to the next minute boundary so the line moves when
    // the clock does, not 40 seconds later.
    let interval: number | undefined;
    const align = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), intervalMs);
    }, intervalMs - (Date.now() % intervalMs));

    return () => {
      window.clearTimeout(align);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
