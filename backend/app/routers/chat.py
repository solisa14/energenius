"""
POST /api/chat — proxy to Backboard; thread_id persisted client-side.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import ChatRequest, ChatResponse
from backend.app.services.backboard_client import backboard_chat

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def post_chat(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
) -> ChatResponse:
    return await backboard_chat(user_id, body.message, body.thread_id)
