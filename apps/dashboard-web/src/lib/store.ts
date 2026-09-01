import { create } from "zustand";

interface VoiceState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/**
 * The six nav tabs map to today/calendar/family/home/media/launch; settings is
 * reachable from the header gear, not the tab bar. Launch owns a tab of its own
 * — as the full-width top row of the Family screen it took half that page, and
 * the morning routine is a thing you stand in front of on its own.
 */
export type View = "today" | "calendar" | "family" | "home" | "media" | "launch" | "settings";

interface NotificationState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Drives the header bell and the slide-over notification drawer. */
export const useNotificationStore = create<NotificationState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

interface NavState {
  view: View;
  setView: (view: View) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: "today",
  setView: (view) => set({ view }),
}));

interface ActorState {
  /** Currently active household member (null until resolved from the household). */
  actorId: string | null;
  setActorId: (actorId: string | null) => void;
}

export const useActorStore = create<ActorState>((set) => ({
  actorId: null,
  setActorId: (actorId) => set({ actorId }),
}));
