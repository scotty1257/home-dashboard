"""Voice service configuration.

Reads environment variables (or a root .env) to decide how the assistant
resolves intents, recognizes speech, and produces speech.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / ".env")


def _num(value: str | None, fallback: int) -> int:
    try:
        return int(value) if value is not None else fallback
    except ValueError:
        return fallback


class Config:
    port: int = _num(os.getenv("VOICE_PORT"), 8788)
    api_url: str = os.getenv("API_URL", "http://127.0.0.1:8787").rstrip("/")

    stt_provider: str = os.getenv("STT_PROVIDER", "local")
    llm_provider: str = os.getenv("LLM_PROVIDER", "local")
    tts_provider: str = os.getenv("TTS_PROVIDER", "local")
    llm_model: str = os.getenv("LLM_MODEL", "")

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")


config = Config()
