import { EventEmitter } from "node:events";

export type DomainEvent = {
  type: string;
  payload: unknown;
  at: string;
};

/**
 * In-process event hub. Modules emit domain events; the SSE route broadcasts
 * them to connected kiosk clients. Decouples state changes from transport.
 */
class EventHub {
  private emitter = new EventEmitter();

  emit(type: string, payload: unknown): void {
    const event: DomainEvent = { type, payload, at: new Date().toISOString() };
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: DomainEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}

export const eventHub = new EventHub();

/** Events emitted by modules. Centralized so the UI can subscribe to a single stream. */
export const Events = {
  calendarChanged: "calendar:changed",
  handoffChanged: "handoff:changed",
  weatherUpdated: "weather:updated",
  homeStateChanged: "home:state-changed",
  mediaStateChanged: "media:state-changed",
  activityUpdated: "activity:updated",
  settingsChanged: "settings:changed",
  householdChanged: "household:changed",
  permissionChanged: "permission:changed",
  dutyChanged: "duty:changed",
  launchChanged: "launch:changed",
  voiceNoteChanged: "voice-note:changed",
  voiceTurn: "voice:turn",
} as const;
