import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TouchButton } from "../components/TouchButton";
import { useVoiceStore } from "../lib/store";
import { formatClock, formatDate } from "../lib/format";
import "./Header.css";

export function Header() {
  const [now, setNow] = useState(() => new Date());
  const setVoiceOpen = useVoiceStore((s) => s.setOpen);

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 60_000 });
  const { data: spotify } = useQuery({ queryKey: ["media-status"], queryFn: api.mediaStatus, refetchInterval: 60_000 });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const homeDetail = health?.services.find((s) => s.service === "home")?.detail ?? "demo";

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">⌂</span>
        <span className="header__name">Home</span>
      </div>

      <div className="header__clock">
        <span className="header__time">{formatClock(now)}</span>
        <span className="header__date">{formatDate(now)}</span>
      </div>

      <div className="header__right">
        <div className="status-pills">
          <span className="pill pill--ok" title="Weather">🌤️</span>
          <span className={`pill ${homeDetail === "demo" ? "pill--demo" : "pill--ok"}`} title={`Home: ${homeDetail}`}>
            🏠 {homeDetail}
          </span>
          <span className={`pill ${spotify?.authorized ? "pill--ok" : "pill--demo"}`} title="Music">
            🎵 {spotify?.authorized ? "Spotify" : "demo"}
          </span>
        </div>
        <TouchButton variant="primary" icon="🎙️" onClick={() => setVoiceOpen(true)} aria-label="Open voice assistant">
          Assistant
        </TouchButton>
      </div>
    </header>
  );
}
