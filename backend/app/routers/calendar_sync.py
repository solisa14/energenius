"""
POST /api/calendar-sync

Data flow (Phase 4):
1. user_id = Depends(get_current_user_id)
2. default_weekly_availability() or parse ICS → DayAvailability rows.
3. upsert into availability for next 7 days.
4. Return list[DayAvailability].
"""
from typing import Any

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id

router = APIRouter()


@router.post("/calendar-sync")
def post_calendar_sync(
    _user_id: str = Depends(get_current_user_id),
) -> Any:
    raise NotImplementedError("Phase 4")
