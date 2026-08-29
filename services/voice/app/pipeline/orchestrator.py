"""Voice turn orchestration.

Fetches the API's tool registry and device list, plans tool calls with the
selected intent model, executes them through the API's validated executor
(with its confirmation policy), and composes a natural-language reply.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import httpx

from ..providers.base import IntentModel, SpeechToText, TextToSpeech, ToolCall
from ..providers.local import LocalIntentModel


class Orchestrator:
    def __init__(
        self,
        api_url: str,
        intent: IntentModel | None = None,
        stt: SpeechToText | None = None,
        tts: TextToSpeech | None = None,
    ) -> None:
        self.api_url = api_url
        self.intent = intent or LocalIntentModel()
        self.stt = stt
        self.tts = tts

    async def _tools(self) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{self.api_url}/api/voice/tools")
            r.raise_for_status()
            return r.json().get("tools", [])

    async def _context(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{self.api_url}/api/home")
            if r.status_code == 200:
                snapshot = r.json()
                return {"entities": snapshot.get("entities", [])}
            return {"entities": []}

    async def run_turn(self, text: str, confirm: bool = False) -> dict[str, Any]:
        turn_id = uuid.uuid4().hex[:12]
        tools = await self._tools()
        context = await self._context()

        calls = await self.intent.plan(text, tools, context)

        # No tool call → provide a helpful default.
        if not calls:
            return self._reply(
                turn_id, text, "I can check the weather, read or add calendar events, control your devices, or play music. Try asking 'what's the weather' or 'add an event'.",
                [], "read-only",
            )

        results: list[dict[str, Any]] = []
        requires_confirmation = False
        risk: str = "read-only"
        pending_args: dict[str, Any] = {}

        async with httpx.AsyncClient(timeout=15) as client:
            for call in calls:
                r = await client.post(
                    f"{self.api_url}/api/voice/execute",
                    json={"tool": call.tool, "arguments": call.arguments, "confirm": confirm},
                )
                if r.status_code == 409:
                    body = r.json()
                    requires_confirmation = True
                    risk = body.get("risk", "sensitive")
                    pending_args = body.get("arguments", call.arguments)
                    break
                if r.status_code >= 400:
                    results.append({"tool": call.tool, "error": r.json().get("error", "failed")})
                else:
                    body = r.json()
                    risk = body.get("risk", "read-only")
                    results.append({"tool": call.tool, "result": body.get("result"), "risk": risk})

        if requires_confirmation:
            return {
                "id": turn_id,
                "state": "confirming",
                "transcript": text,
                "reply": self._confirmation_message(calls[0] if calls else ToolCall("?", {})),
                "toolCalls": [{"tool": c.tool, "arguments": c.arguments} for c in calls],
                "pendingArguments": pending_args,
                "requiresConfirmation": True,
                "risk": risk,
                "createdAt": datetime.now().astimezone().isoformat(),
            }

        reply = self._compose_reply(calls, results)
        audio = await self._synthesize(reply)
        return {
            "id": turn_id,
            "state": "speaking",
            "transcript": text,
            "reply": reply,
            "toolCalls": [{"tool": c.tool, "arguments": c.arguments} for c in calls],
            "requiresConfirmation": False,
            "risk": risk,
            "audioUrl": audio,
            "createdAt": datetime.now().astimezone().isoformat(),
        }

    def _reply(self, turn_id: str, text: str, reply: str, calls: list[ToolCall], risk: str) -> dict[str, Any]:
        return {
            "id": turn_id,
            "state": "speaking",
            "transcript": text,
            "reply": reply,
            "toolCalls": [{"tool": c.tool, "arguments": c.arguments} for c in calls],
            "requiresConfirmation": False,
            "risk": risk,
            "createdAt": datetime.now().astimezone().isoformat(),
        }

    async def _synthesize(self, text: str) -> str | None:
        if self.tts is None:
            return None
        try:
            return await self.tts.synthesize(text)
        except Exception:
            return None

    @staticmethod
    def _humanize(value: object) -> str:
        return str(value).replace(".", " ").replace("_", " ").strip()

    @staticmethod
    def _confirmation_message(call: ToolCall) -> str:
        label = call.tool
        if call.tool == "home_control":
            action = Orchestrator._humanize(call.arguments.get("action", "control"))
            entity = Orchestrator._humanize(call.arguments.get("entityId", "device"))
            label = f"{action} {entity}"
        return f"I'd like to {label}. Tap confirm to proceed."

    def _compose_reply(self, calls: list[ToolCall], results: list[dict[str, Any]]) -> str:
        parts: list[str] = []
        for call, res in zip(calls, results):
            tool = call.tool
            if "error" in res:
                parts.append(f"I couldn't {tool.replace('_', ' ')} ({res['error']}).")
                continue
            data = res.get("result")
            if tool == "get_weather":
                parts.append(self._weather_reply(data))
            elif tool == "query_calendar":
                parts.append(self._calendar_reply(data))
            elif tool == "create_event":
                parts.append(f"Added {call.arguments.get('title', 'your event')} to the calendar.")
            elif tool == "list_home_devices":
                parts.append(self._devices_reply(data))
            elif tool == "home_control":
                parts.append(self._home_reply(call))
            elif tool == "media_control":
                parts.append(self._media_reply(call))
            else:
                parts.append("Done.")
        if len(calls) > len(results):
            parts.append("One or more actions still need attention.")
        return " ".join(parts)

    @staticmethod
    def _weather_reply(data: Any) -> str:
        if not isinstance(data, dict):
            return "Here's the weather."
        cur = data.get("current", {})
        cond = cur.get("condition", "cloudy").replace("-", " ")
        temp = cur.get("temperature")
        unit = "°F" if data.get("units") == "imperial" else "°C"
        hum = cur.get("humidity")
        return f"It's {temp}{unit} and {cond} right now, humidity {hum}%."

    @staticmethod
    def _calendar_reply(data: Any) -> str:
        events = data if isinstance(data, list) else []
        if not events:
            return "You have no events in that range."
        titles = ", ".join(e.get("title", "event") for e in events[:5])
        extra = f" and {len(events) - 5} more" if len(events) > 5 else ""
        return f"You have {len(events)} event(s): {titles}{extra}."

    @staticmethod
    def _devices_reply(data: Any) -> str:
        devices = data if isinstance(data, list) else []
        if not devices:
            return "I couldn't find any devices."
        on = [d for d in devices if d.get("state") in ("on", "open", "unlocked", "playing")]
        return f"You have {len(devices)} devices; {len(on)} are active."

    @staticmethod
    def _home_reply(call: ToolCall) -> str:
        action = Orchestrator._humanize(call.arguments.get("action", "controlled"))
        name = Orchestrator._humanize(call.arguments.get("entityId", "device"))
        return f"{action.capitalize()} {name}."

    @staticmethod
    def _media_reply(call: ToolCall) -> str:
        action = call.arguments.get("action", "play")
        if action == "setVolume":
            return f"Volume set to {call.arguments.get('volume')}."
        return f"Music {action}." if action != "play" else "Playing music."
