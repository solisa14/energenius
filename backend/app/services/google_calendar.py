"""Fetch and slice Google Calendar events in the user's local timezone."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx

from backend.app.services.calendar_parser import safe_zoneinfo

GOOGLE_CAL_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
REQUEST_TIMEOUT_S = 30.0
LIST_FIELDS = (
    "items(id,status,transparency,summary,description,location,start,end),"
    "nextPageToken"
)


def _parse_rfc3339(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def fetch_events_for_local_days(
    provider_token: str,
    range_start: date,
    range_end_exclusive: date,
    timezone_name: str | None,
) -> list[dict[str, Any]]:
    """
    Fetch Google events for [range_start, range_end_exclusive) in the user's zone.
    """
    tz = safe_zoneinfo(timezone_name)
    time_min = datetime.combine(range_start, time.min, tzinfo=tz).astimezone(timezone.utc)
    time_max = datetime.combine(range_end_exclusive, time.min, tzinfo=tz).astimezone(
        timezone.utc
    )
    base_params: dict[str, str] = {
        "timeMin": time_min.isoformat().replace("+00:00", "Z"),
        "timeMax": time_max.isoformat().replace("+00:00", "Z"),
        "singleEvents": "true",
        "orderBy": "startTime",
        "timeZone": timezone_name or "UTC",
        "fields": LIST_FIELDS,
    }
    headers = {"Authorization": f"Bearer {provider_token}"}
    events: list[dict[str, Any]] = []
    page_token: str | None = None
    with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
        while True:
            params = {**base_params, **({"pageToken": page_token} if page_token else {})}
            response = client.get(GOOGLE_CAL_EVENTS_URL, params=params, headers=headers)
            if response.status_code in (401, 403):
                raise PermissionError("Google Calendar token invalid or missing scope")
            response.raise_for_status()
            data = response.json()
            events.extend(data.get("items") or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return events


def build_day_events_local(
    google_items: list[dict[str, Any]],
    day: date,
    timezone_name: str | None,
) -> list[dict[str, str]]:
    tz = safe_zoneinfo(timezone_name)
    day_start = datetime.combine(day, time.min, tzinfo=tz)
    day_end = day_start + timedelta(days=1)
    result: list[dict[str, str]] = []
    for ev in google_items:
        if ev.get("status") == "cancelled" or ev.get("transparency") == "transparent":
            continue
        start_raw = ev.get("start") or {}
        end_raw = ev.get("end") or {}
        if "dateTime" in start_raw and "dateTime" in end_raw:
            start = _parse_rfc3339(str(start_raw["dateTime"]))
            end = _parse_rfc3339(str(end_raw["dateTime"]))
            if start is None or end is None:
                continue
            local_start = start.astimezone(tz)
            local_end = end.astimezone(tz)
        elif "date" in start_raw and "date" in end_raw:
            try:
                start_day = date.fromisoformat(str(start_raw["date"]))
                end_day = date.fromisoformat(str(end_raw["date"]))
            except ValueError:
                continue
            local_start = datetime.combine(start_day, time.min, tzinfo=tz)
            local_end = datetime.combine(end_day, time.min, tzinfo=tz)
        else:
            continue
        lo = max(local_start, day_start)
        hi = min(local_end, day_end)
        if hi <= lo:
            continue
        result.append(
            {
                "start": lo.isoformat(),
                "end": hi.isoformat(),
                "summary": str(ev.get("summary") or ""),
                "description": str(ev.get("description") or ""),
                "location": str(ev.get("location") or ""),
            }
        )
    return result
