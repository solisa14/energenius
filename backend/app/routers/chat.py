"""
POST /api/chat — native Gemma response with Backboard memory context.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import ChatRequest, ChatResponse
from backend.app.services.chat_orchestrator import hybrid_chat

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def post_chat(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
) -> ChatResponse:
    return await hybrid_chat(user_id, body.message, body.thread_id)
