import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeEvents } from "./events";

/**
 * Keeps the dashboard live: subscribes to the API's SSE stream and invalidates
 * the matching React Query caches whenever a domain event arrives.
 */
export function useLiveEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateFor = (type: string) => {
      if (type.startsWith("calendar")) queryClient.invalidateQueries({ queryKey: ["calendar"] });
      if (type.startsWith("home")) queryClient.invalidateQueries({ queryKey: ["home"] });
      if (type.startsWith("media")) queryClient.invalidateQueries({ queryKey: ["media"] });
      if (type.startsWith("weather")) queryClient.invalidateQueries({ queryKey: ["weather"] });
      if (type.startsWith("settings")) queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (type.startsWith("activity")) queryClient.invalidateQueries({ queryKey: ["activity"] });
    };

    const unsubscribe = subscribeEvents((event) => invalidateFor(event.type));
    return unsubscribe;
  }, [queryClient]);
}
