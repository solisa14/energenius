"""POST /api/calendar-sync — sync calendar into availability and clarifications."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import CalendarSyncRequest, CalendarSyncResponse
from backend.app.services.availability_assistant import (
    CalendarSyncFailure,
    sync_calendar_availability,
)

router = APIRouter()


@router.post("/calendar-sync", response_model=CalendarSyncResponse)
async def post_calendar_sync(
    body: CalendarSyncRequest,
    user_id: str = Depends(get_current_user_id),
) -> CalendarSyncResponse:
    try:
        return await sync_calendar_availability(
            user_id,
            provider_token=body.provider_token,
            timezone_hint=body.timezone,
        )
    except CalendarSyncFailure as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
