import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeEvents } from "./events";

/**
 * Maps a domain event type to the query keys it must refresh. Pure so the
 * event → cache contract can be unit-tested without an EventSource. Family
 * events always refresh the activity feed too, since the feed merges handoff
 * and permission status into its ranking.
 */
export function invalidationsFor(type: string): string[][] {
  const keys: string[][] = [];
  if (type.startsWith("calendar")) keys.push(["calendar"]);
  if (type.startsWith("home")) keys.push(["home"]);
  if (type.startsWith("media")) keys.push(["media"]);
  if (type.startsWith("weather")) keys.push(["weather"]);
  if (type.startsWith("settings")) keys.push(["settings"]);
  if (type.startsWith("activity")) keys.push(["activity"]);
  if (type.startsWith("household")) keys.push(["household"]);
  if (type.startsWith("handoff")) keys.push(["handoffs"], ["backup-contacts"], ["activity"]);
  if (type.startsWith("permission")) keys.push(["permissions"], ["permission-rules"], ["activity"]);
  if (type.startsWith("duty")) keys.push(["duties"], ["activity"]);
  if (type.startsWith("voice-note")) keys.push(["voice-notes"], ["activity"]);
  if (type.startsWith("launch")) keys.push(["launch"], ["activity"]);
  return keys;
}

/**
 * Keeps the dashboard live: subscribes to the API's SSE stream and invalidates
 * the matching React Query caches whenever a domain event arrives.
 */
export function useLiveEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateFor = (type: string) => {
      for (const queryKey of invalidationsFor(type)) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const unsubscribe = subscribeEvents((event) => invalidateFor(event.type));
    return unsubscribe;
  }, [queryClient]);
}
