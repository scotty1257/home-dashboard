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
 * The six nav tabs map to today/calendar/family/launch/home/media; settings is
 * reachable from the header gear, not the tab bar.
 */
export type View = "today" | "calendar" | "family" | "launch" | "home" | "media" | "settings";

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
