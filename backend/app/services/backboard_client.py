"""httpx client for Backboard.io + Gemma (Phase 4)."""

from __future__ import annotations

from backend.app.models.schemas import ChatResponse


async def backboard_chat(
    user_id: str,
    message: str,
    thread_id: str | None = None,
) -> ChatResponse:
    """POST to Backboard; user_id is persistent thread key (Phase 4)."""
    raise NotImplementedError("Phase 4")
