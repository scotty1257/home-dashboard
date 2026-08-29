import { useNavStore } from "./lib/store";
import { useTimeOfDayTheme } from "./lib/theme";
import { useLiveEvents } from "./lib/useLiveEvents";
import { Header } from "./app/Header";
import { Nav } from "./app/Nav";
import { CalendarPanel } from "./features/calendar/CalendarPanel";
import { WeatherPanel } from "./features/weather/WeatherPanel";
import { NowPlaying } from "./features/media/NowPlaying";
import { ActivityFeed } from "./features/overview/ActivityFeed";
import { HomeOverview } from "./features/home/HomeOverview";
import { VoiceOverlay } from "./features/voice/VoiceOverlay";
import { SettingsScreen } from "./features/settings/SettingsScreen";

function OverviewView() {
  return (
    <div className="grid h-full grid-cols-12 gap-5">
      <div className="col-span-7 min-h-0">
        <CalendarPanel className="h-full" />
      </div>
      <div className="col-span-5 flex min-h-0 flex-col gap-5">
        <WeatherPanel />
        <NowPlaying />
        <div className="min-h-0 flex-1">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

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

function MediaView() {
  return (
    <div className="mx-auto h-full w-full max-w-xl overflow-y-auto">
      <NowPlaying />
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
    <div className="flex h-full flex-col bg-canvas text-ink">
      <Header />
      <main className="min-h-0 flex-1 overflow-hidden px-6 py-5">
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
