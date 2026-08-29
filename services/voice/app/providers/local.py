"""Local (no-API-key) intent model.

A deterministic matcher that turns natural utterances into tool calls. This
keeps the assistant fully functional without any external credentials, and
serves as the reference behavior for richer LLM-backed providers.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from .base import IntentModel, ToolCall

DAY_NAMES = {
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3,
    "thursday": 4, "friday": 5, "saturday": 6,
}


def _to_iso(dt: datetime) -> str:
    return dt.astimezone().isoformat()


def _parse_time(text: str, base: datetime) -> datetime | None:
    """Extract 'at 3pm', 'at 14:30' style time hints; returns None if absent."""
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", text, re.IGNORECASE)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    meridian = (m.group(3) or "").lower()
    if meridian == "pm" and hour < 12:
        hour += 12
    elif meridian == "am" and hour == 12:
        hour = 0
    d = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if d < base:
        d += timedelta(days=1)
    return d


def _parse_day(text: str, base: datetime) -> datetime:
    """Resolve today / tomorrow / weekday names relative to base."""
    t = text.lower()
    if "tomorrow" in t:
        return (base + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    for name, idx in DAY_NAMES.items():
        if name in t:
            days_ahead = (idx - base.weekday()) % 7
            days_ahead = days_ahead or 7
            return (base + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)
    return base.replace(hour=9, minute=0, second=0, microsecond=0)


class LocalIntentModel(IntentModel):
    async def plan(
        self,
        text: str,
        tools: list[dict[str, Any]],
        context: dict[str, Any] | None = None,
    ) -> list[ToolCall]:
        t = text.lower().strip()
        now = datetime.now().astimezone()

        # ---- Weather ----
        if any(w in t for w in ("weather", "temperature", "forecast", "how hot", "how cold", "will it rain", "rain today")):
            return [ToolCall("get_weather", {})]

        # ---- Calendar query ----
        if any(w in t for w in ("what's on my calendar", "what is on my calendar", "my schedule", "my agenda", "my calendar", "events today", "schedule today", "what's today")):
            range_val = "tomorrow" if "tomorrow" in t else ("week" if ("week" in t or "this week" in t) else "today")
            return [ToolCall("query_calendar", {"range": range_val})]

        # ---- Calendar create ----
        if any(w in t for w in ("add event", "create event", "schedule", "remind me", "add to calendar", "new event", "set a reminder")):
            title = self._extract_event_title(text)
            day = _parse_day(t, now)
            start = _parse_time(t, day) or day.replace(hour=9)
            end = start + timedelta(hours=1)
            return [ToolCall("create_event", {
                "title": title,
                "start": _to_iso(start),
                "end": _to_iso(end),
                "allDay": "all day" in t or "all-day" in t,
            })]

        # ---- Media control ----
        if any(w in t for w in ("pause", "stop the music", "pause music")):
            return [ToolCall("media_control", {"action": "pause"})]
        if any(w in t for w in ("next track", "next song", "skip", "next")):
            return [ToolCall("media_control", {"action": "next"})]
        if any(w in t for w in ("previous", "go back", "last song")):
            return [ToolCall("media_control", {"action": "previous"})]
        if any(w in t for w in ("play", "resume", "music on")):
            return [ToolCall("media_control", {"action": "play"})]
        m = re.search(r"volume (?:to )?(\d{1,3})", t)
        if m:
            return [ToolCall("media_control", {"action": "setVolume", "volume": min(100, int(m.group(1)))})]

        # ---- Home control ----
        home_call = self._parse_home_control(text, context or {})
        if home_call:
            return [home_call]

        # ---- Fallback ----
        return [ToolCall("list_home_devices", {})]

    @staticmethod
    def _extract_event_title(text: str) -> str:
        text = re.sub(
            r"(add event|create event|schedule|remind me|add to calendar|new event|set a reminder)",
            "", text, flags=re.IGNORECASE,
        )
        text = re.sub(r"\b(today|tomorrow|at\s+\d|on\s+\w+day)\b.*", "", text, flags=re.IGNORECASE)
        title = re.sub(r"\s{2,}", " ", text).strip(" ,.-:")
        return title[:80] or "Event"

    def _parse_home_control(self, text: str, context: dict[str, Any]) -> ToolCall | None:
        entities: list[dict[str, Any]] = context.get("entities", [])
        lower = text.lower()

        # Determine action
        action: str | None = None
        params: dict[str, Any] = {}
        if "turn off" in lower or "switch off" in lower:
            action = "turn_off"
        elif "turn on" in lower or "switch on" in lower:
            action = "turn_on"
        elif "lock" in lower and "unlock" not in lower:
            action = "lock"
        elif "unlock" in lower:
            action = "unlock"
        elif "open" in lower and "close" not in lower:
            action = "open_cover"
        elif "close" in lower:
            action = "close_cover"
        elif "set the thermostat" in lower or "set temperature" in lower:
            action = "set_temperature"
            m = re.search(r"(\d{2,3})", lower)
            if m:
                params["temperature"] = int(m.group(1))
                params["hvac_mode"] = "heat"
        elif "dim" in lower or "brightness" in lower:
            action = "set_brightness"
            m = re.search(r"(\d{1,3})", lower)
            params["brightness"] = int(m.group(1)) if m else 100

        if not action:
            return None

        # Match an entity by fuzzy name/area/alias
        target = self._match_entity(lower, entities)
        if not target:
            return None

        return ToolCall("home_control", {
            "entityId": target["id"],
            "action": action,
            "params": params,
        })

    @staticmethod
    def _match_entity(text: str, entities: list[dict[str, Any]]) -> dict[str, Any] | None:
        best: dict[str, Any] | None = None
        best_score = 0
        for e in entities:
            name = (e.get("alias") or e.get("name") or e["id"]).lower()
            area = (e.get("area") or "").lower()
            domain = e.get("domain", "")
            score = 0
            words = [w for w in re.split(r"\W+", name) if len(w) > 2]
            for w in words:
                if w in text:
                    score += 3
            if area and area in text:
                score += 2
            if domain in text:
                score += 2
            if score > best_score:
                best_score = score
                best = e
        return best if best_score > 0 else None
