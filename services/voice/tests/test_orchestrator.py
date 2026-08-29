"""Unit tests for the orchestrator's reply composition (no network)."""
from __future__ import annotations

from app.pipeline.orchestrator import Orchestrator
from app.providers.base import ToolCall


def test_weather_reply() -> None:
    o = Orchestrator(api_url="http://unused")
    data = {"units": "imperial", "current": {"temperature": 71.5, "condition": "partly-cloudy", "humidity": 60}}
    reply = o._weather_reply(data)
    assert "71.5°F" in reply and "partly cloudy" in reply


def test_calendar_reply_empty() -> None:
    o = Orchestrator(api_url="http://unused")
    assert "no events" in o._calendar_reply([])


def test_calendar_reply_lists_titles() -> None:
    o = Orchestrator(api_url="http://unused")
    reply = o._calendar_reply([{"title": "Dentist"}, {"title": "Standup"}])
    assert "Dentist" in reply and "Standup" in reply


def test_devices_reply_counts_active() -> None:
    o = Orchestrator(api_url="http://unused")
    reply = o._devices_reply([{"state": "on"}, {"state": "off"}, {"state": "open"}])
    assert "3 devices" in reply and "2 are active" in reply


def test_home_reply_humanizes_entity() -> None:
    o = Orchestrator(api_url="http://unused")
    reply = o._home_reply(ToolCall("home_control", {"action": "turn_off", "entityId": "light.living_room"}))
    assert "Turn off light living room" in reply


def test_confirmation_message() -> None:
    msg = Orchestrator._confirmation_message(ToolCall("home_control", {"action": "unlock", "entityId": "lock.front_door"}))
    assert "confirm" in msg.lower()
