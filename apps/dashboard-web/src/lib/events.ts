/**
 * Server-sent events for live updates. Subscribes to the API's event stream
 * and invokes an onEvent callback with typed event names + payloads.
 */
export type LiveEvent = { type: string; payload: unknown; at: string };

export function subscribeEvents(onEvent: (event: LiveEvent) => void): () => void {
  const es = new EventSource("/api/events");

  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as LiveEvent;
      onEvent(event);
    } catch {
      // ignore malformed events
    }
  };

  es.onerror = () => {
    // EventSource auto-reconnects; nothing to do here.
  };

  return () => es.close();
}
