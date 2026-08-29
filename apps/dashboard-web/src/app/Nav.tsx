import { useNavStore } from "../lib/store";
import "./Nav.css";

const TABS = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "calendar", label: "Calendar", icon: "🗓️" },
  { id: "home", label: "Home", icon: "💡" },
  { id: "media", label: "Music", icon: "🎵" },
  { id: "settings", label: "Settings", icon: "⚙️" },
] as const;

export function Nav() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);

  return (
    <nav className="nav" aria-label="Primary">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`nav__item ${view === tab.id ? "nav__item--active" : ""}`}
          onClick={() => setView(tab.id)}
          aria-current={view === tab.id ? "page" : undefined}
        >
          <span className="nav__icon">{tab.icon}</span>
          <span className="nav__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
