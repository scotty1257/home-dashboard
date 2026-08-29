"""HTTP endpoints for the voice assistant (text-first, WebSocket later)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import config
from ..pipeline.orchestrator import Orchestrator

router = APIRouter(prefix="/api/voice", tags=["voice"])

orchestrator = Orchestrator(api_url=config.api_url)


class VoiceRequest(BaseModel):
    text: str
    sessionId: str | None = None
    confirm: bool = False


class HealthResponse(BaseModel):
    status: str
    providers: dict[str, str]


@router.get("/health")
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        providers={
            "stt": config.stt_provider,
            "llm": config.llm_provider,
            "tts": config.tts_provider,
        },
    )


@router.post("/session")
async def session(req: VoiceRequest) -> dict[str, Any]:
    return await orchestrator.run_turn(req.text, confirm=req.confirm)
