"""
POST /api/chat

Data flow (Phase 4):
1. user_id = Depends(get_current_user_id)
2. await backboard_chat(user_id, body.message, body.thread_id) — user_id is persistent thread key.
3. Return ChatResponse (reply, thread_id, sources); client stores thread_id for follow-ups.
"""
from typing import Any

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def post_chat(
    body: ChatRequest,
    _user_id: str = Depends(get_current_user_id),
) -> Any:
    raise NotImplementedError("Phase 4")
