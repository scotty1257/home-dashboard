import { useNavStore } from "./lib/store";
import { useTimeOfDayTheme } from "./lib/theme";
import { useLiveEvents } from "./lib/useLiveEvents";
import { SpaceBackground } from "./components/SpaceBackground";
import { Header } from "./app/Header";
import { Nav } from "./app/Nav";
import { CalendarPanel } from "./features/calendar/CalendarPanel";
import { TodayOverview } from "./features/overview/TodayOverview";
import { FamilyScreen } from "./features/family/FamilyScreen";
import { LaunchScreen } from "./features/launch/LaunchScreen";
import { HomeOverview } from "./features/home/HomeOverview";
import { MediaScreen } from "./features/media/MediaScreen";
import { VoiceOverlay } from "./features/voice/VoiceOverlay";
import { SettingsScreen } from "./features/settings/SettingsScreen";

function CalendarView() {
  return <CalendarPanel className="h-full" />;
}

function HomeView() {
  return (
    <div className="h-full overflow-y-auto">
      <HomeOverview />
    </div>
  );
}

function SettingsView() {
  return (
    <div className="h-full overflow-y-auto py-2">
      <SettingsScreen />
    </div>
  );
}

export default function App() {
  const view = useNavStore((s) => s.view);
  useTimeOfDayTheme();
  useLiveEvents();

  return (
    <div className="relative flex h-full flex-col text-ink">
      <SpaceBackground />

      <div className="relative z-10 flex h-full flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto p-6 2xl:overflow-hidden">
          {view === "today" && <TodayOverview />}
          {view === "calendar" && <CalendarView />}
          {view === "family" && <FamilyScreen />}
          {view === "launch" && <LaunchScreen />}
          {view === "home" && <HomeView />}
          {view === "media" && <MediaScreen />}
          {view === "settings" && <SettingsView />}
        </main>
        <Nav />
      </div>

      <VoiceOverlay />
    </div>
  );
}
