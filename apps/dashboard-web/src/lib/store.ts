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
 * The five nav tabs map to today/calendar/family/home/media; settings is
 * reachable from the header gear, not the tab bar. The launch sequence lives
 * inside the Family tab rather than owning a tab of its own.
 */
export type View = "today" | "calendar" | "family" | "home" | "media" | "settings";

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
