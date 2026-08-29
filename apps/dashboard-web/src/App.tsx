import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useLiveEvents } from "./lib/useLiveEvents";
import { useSettingsStore, useNavStore } from "./lib/store";
import { Header } from "./app/Header";
import { Nav } from "./app/Nav";
import { CalendarPanel } from "./features/calendar/CalendarPanel";
import { WeatherPanel } from "./features/weather/WeatherPanel";
import { NowPlaying } from "./features/media/NowPlaying";
import { ActivityFeed } from "./features/overview/ActivityFeed";
import { HomeOverview } from "./features/home/HomeOverview";
import { VoiceOverlay } from "./features/voice/VoiceOverlay";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import "./app/DashboardLayout.css";

function OverviewView() {
  return (
    <div className="overview">
      <div className="overview__main">
        <CalendarPanel />
      </div>
      <div className="overview__rail">
        <WeatherPanel />
        <NowPlaying />
        <ActivityFeed />
      </div>
      <div className="overview__home">
        <h3 className="overview__section-title">Favorites</h3>
        <HomeOverview favoritesOnly max={6} />
      </div>
    </div>
  );
}

function CalendarView() {
  return (
    <div className="single-view">
      <CalendarPanel />
    </div>
  );
}

function HomeView() {
  return (
    <div className="single-view">
      <HomeOverview />
    </div>
  );
}

function MediaView() {
  return (
    <div className="single-view single-view--narrow">
      <NowPlaying />
    </div>
  );
}

function SettingsView() {
  return <SettingsScreen />;
}

export default function App() {
  const view = useNavStore((s) => s.view);
  const setSettings = useSettingsStore((s) => s.setSettings);
  useLiveEvents();

  // Load settings once and drive theme attributes from them.
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (settings) setSettings(settings);
  }, [settings, setSettings]);

  useEffect(() => {
    const applyTheme = () => {
      const s = useSettingsStore.getState().settings;
      const theme = s?.theme ?? "dark";
      const resolved = theme === "auto" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.setAttribute("data-accent", s?.accentColor ?? "coral");
    };
    applyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", applyTheme);
    return () => mq.removeEventListener("change", applyTheme);
  }, [queryClient]);

  return (
    <div className="app">
      <Header />
      <main className="app__content">
        {view === "overview" && <OverviewView />}
        {view === "calendar" && <CalendarView />}
        {view === "home" && <HomeView />}
        {view === "media" && <MediaView />}
        {view === "settings" && <SettingsView />}
      </main>
      <Nav />
      <VoiceOverlay />
    </div>
  );
}
