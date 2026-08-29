import { create } from "zustand";
import type { DashboardSettings } from "@home-dashboard/contracts";

interface SettingsState {
  settings: DashboardSettings | null;
  setSettings: (settings: DashboardSettings) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}));

interface VoiceState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

interface NavState {
  view: "overview" | "calendar" | "home" | "media" | "settings";
  setView: (view: NavState["view"]) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: "overview",
  setView: (view) => set({ view }),
}));
