"""
POST /api/calendar-sync — 7-day default work-week availability for the demo.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id
from backend.app.database import get_supabase
from backend.app.models.schemas import DayAvailability
from backend.app.services.calendar_parser import default_weekly_availability

router = APIRouter()


@router.post("/calendar-sync", response_model=list[DayAvailability])
def post_calendar_sync(
    user_id: str = Depends(get_current_user_id),
) -> list[DayAvailability]:
    supabase = get_supabase()
    days = default_weekly_availability()
    rows = [
        {
            "user_id": user_id,
            "date": d.date.isoformat(),
            "slots": d.slots,
        }
        for d in days
    ]
    if rows:
        supabase.table("availability").upsert(
            rows,
            on_conflict="user_id,date",
        ).execute()
    return days
