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
 * 'family' and 'launch' exist ahead of the nav wiring so the feature screens
 * compile now; the nav rail adopts them in a later task.
 */
export type View = "overview" | "calendar" | "family" | "launch" | "home" | "media" | "settings";

interface NavState {
  view: View;
  setView: (view: View) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: "overview",
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
