"""
POST /api/calendar-sync — 7-day availability from Google Calendar or default work-week.
"""
from __future__ import annotations

from datetime import date, timedelta

import httpx
from fastapi import APIRouter, Body, Depends

from backend.app.auth import get_current_user_id
from backend.app.database import get_supabase
from backend.app.models.schemas import CalendarSyncRequest, DayAvailability
from backend.app.services.calendar_parser import default_weekly_availability, parse_to_availability
from backend.app.services.google_calendar import build_day_events_utc, fetch_events_for_range_utc

router = APIRouter()


@router.post("/calendar-sync", response_model=list[DayAvailability])
def post_calendar_sync(
    user_id: str = Depends(get_current_user_id),
    body: CalendarSyncRequest = Body(default_factory=CalendarSyncRequest),
) -> list[DayAvailability]:
    supabase = get_supabase()
    if body.provider_token:
        start = date.today()
        end_excl = start + timedelta(days=7)
        try:
            raw = fetch_events_for_range_utc(body.provider_token, start, end_excl)
        except (PermissionError, httpx.HTTPError, OSError, ValueError):
            days = default_weekly_availability()
        else:
            days = []
            for n in range(7):
                d = start + timedelta(days=n)
                day_evs = build_day_events_utc(raw, d)
                slots = parse_to_availability(day_evs, target_date=d)
                days.append(DayAvailability(date=d, slots=slots))
    else:
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
