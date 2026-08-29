"""Home dashboard voice assistant service."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.session import router as session_router
from .config import config

app = FastAPI(title="Home Dashboard Voice Assistant", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session_router)


@app.get("/health")
async def root_health() -> dict[str, str]:
    return {"status": "ok", "service": "voice", "port": str(config.port)}
