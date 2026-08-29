"""Provider interfaces for the voice pipeline.

Each stage (STT, LLM/intent, TTS) is pluggable so local and cloud
implementations can be swapped without changing the orchestrator.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    tool: str
    arguments: dict[str, Any] = field(default_factory=dict)


class SpeechToText(ABC):
    """Transcribes audio bytes into text. Passthrough for text-only sessions."""

    @abstractmethod
    async def transcribe(self, audio: bytes) -> str:
        raise NotImplementedError


class IntentModel(ABC):
    """Turns a user utterance into one or more proposed tool calls + a reply."""

    @abstractmethod
    async def plan(
        self,
        text: str,
        tools: list[dict[str, Any]],
        context: dict[str, Any] | None = None,
    ) -> list[ToolCall]:
        raise NotImplementedError


class TextToSpeech(ABC):
    """Synthesizes speech from text. Returns an audio URL or None to let the
    client (browser speechSynthesis) speak the reply itself."""

    @abstractmethod
    async def synthesize(self, text: str) -> str | None:
        raise NotImplementedError
