"""Unit tests for the local (rule-based) intent model."""
from __future__ import annotations

import asyncio

import pytest

from app.providers.local import LocalIntentModel


@pytest.fixture
def model() -> LocalIntentModel:
    return LocalIntentModel()


def run(coro):
    return asyncio.run(coro)


def _entities() -> list[dict]:
    return [
        {"id": "light.living_room", "name": "Living Room", "area": "Living Room", "domain": "light"},
        {"id": "light.kitchen", "name": "Kitchen", "area": "Kitchen", "domain": "light"},
        {"id": "lock.front_door", "name": "Front Door", "area": "Entryway", "domain": "lock"},
    ]


def test_weather_intent(model: LocalIntentModel) -> None:
    calls = run(model.plan("what's the weather today", [], {}))
    assert len(calls) == 1
    assert calls[0].tool == "get_weather"


def test_calendar_query(model: LocalIntentModel) -> None:
    calls = run(model.plan("what's on my calendar tomorrow", [], {}))
    assert calls[0].tool == "query_calendar"
    assert calls[0].arguments["range"] == "tomorrow"


def test_create_event(model: LocalIntentModel) -> None:
    calls = run(model.plan("add event dentist tomorrow at 3pm", [], {}))
    assert calls[0].tool == "create_event"
    assert calls[0].arguments["title"].lower() == "dentist"


def test_turn_off_matches_entity(model: LocalIntentModel) -> None:
    calls = run(model.plan("turn off the living room light", [], {"entities": _entities()}))
    assert calls[0].tool == "home_control"
    assert calls[0].arguments["entityId"] == "light.living_room"
    assert calls[0].arguments["action"] == "turn_off"


def test_lock_matches_lock_entity(model: LocalIntentModel) -> None:
    calls = run(model.plan("lock the front door", [], {"entities": _entities()}))
    assert calls[0].tool == "home_control"
    assert calls[0].arguments["entityId"] == "lock.front_door"
    assert calls[0].arguments["action"] == "lock"


def test_media_pause(model: LocalIntentModel) -> None:
    calls = run(model.plan("pause the music", [], {}))
    assert calls[0].tool == "media_control"
    assert calls[0].arguments["action"] == "pause"


def test_volume_parsing(model: LocalIntentModel) -> None:
    calls = run(model.plan("set the volume to 40", [], {}))
    assert calls[0].tool == "media_control"
    assert calls[0].arguments["action"] == "setVolume"
    assert calls[0].arguments["volume"] == 40
