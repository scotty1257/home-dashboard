import { create } from "zustand";

interface VoiceState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export type View = "overview" | "calendar" | "home" | "media" | "settings";

interface NavState {
  view: View;
  setView: (view: View) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: "overview",
  setView: (view) => set({ view }),
}));
