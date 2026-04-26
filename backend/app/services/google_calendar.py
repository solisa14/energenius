"""Fetch events from Google Calendar API v3 for availability sync (read-only)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx

GOOGLE_CAL_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
REQUEST_TIMEOUT_S = 30.0
LIST_FIELDS = "items(id,status,transparency,start,end),nextPageToken"


def _naive_utc(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _parse_google_event_times(ev: dict[str, Any]) -> tuple[datetime, datetime] | None:
    status = ev.get("status")
    if status == "cancelled":
        return None
    if ev.get("transparency") == "transparent":
        return None
    s = ev.get("start") or {}
    e = ev.get("end") or {}
    if "dateTime" in s and "dateTime" in e:
        t0 = _parse_rfc3339_to_naive_utc(s["dateTime"])
        t1 = _parse_rfc3339_to_naive_utc(e["dateTime"])
    elif "date" in s and "date" in e:
        d0 = date.fromisoformat(str(s["date"]))
        d1 = date.fromisoformat(str(e["date"]))
        t0 = _naive_utc(d0)
        t1 = _naive_utc(d1)
    else:
        return None
    if t1 <= t0:
        return None
    return t0, t1


def _parse_rfc3339_to_naive_utc(value: str) -> datetime | None:
    try:
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def fetch_events_for_range_utc(
    provider_token: str, range_start: date, range_end_exclusive: date
) -> list[dict[str, Any]]:
    """
    `range_start` and `range_end_exclusive` are calendar days; window is
    [range_start 00:00 UTC, range_end_exclusive 00:00 UTC).
    """
    time_min = _naive_utc(range_start).replace(tzinfo=timezone.utc)
    time_max = _naive_utc(range_end_exclusive).replace(tzinfo=timezone.utc)
    base_params: dict[str, str] = {
        "timeMin": time_min.isoformat().replace("+00:00", "Z"),
        "timeMax": time_max.isoformat().replace("+00:00", "Z"),
        "singleEvents": "true",
        "orderBy": "startTime",
        "timeZone": "UTC",
        "fields": LIST_FIELDS,
    }
    headers = {"Authorization": f"Bearer {provider_token}"}
    out: list[dict[str, Any]] = []
    page_token: str | None = None
    with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
        while True:
            params = {**base_params, **({"pageToken": page_token} if page_token else {})}
            r = client.get(GOOGLE_CAL_EVENTS_URL, params=params, headers=headers)
            if r.status_code in (401, 403):
                raise PermissionError("Google Calendar token invalid or missing scope")
            r.raise_for_status()
            data = r.json()
            out.extend(data.get("items") or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return out


def slice_event_for_day(
    t0: datetime, t1: datetime, day: date
) -> dict[str, str] | None:
    day_start = _naive_utc(day)
    day_end = day_start + timedelta(days=1)
    lo = t0 if t0 > day_start else day_start
    hi = t1 if t1 < day_end else day_end
    if lo >= hi:
        return None
    return {"start": _iso_utc_z(lo), "end": _iso_utc_z(hi)}


def _iso_utc_z(dt: datetime) -> str:
    d = dt.replace(microsecond=0) if dt.microsecond else dt
    return d.isoformat() + "Z"


def build_day_events_utc(google_items: list[dict[str, Any]], day: date) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for ev in google_items:
        times = _parse_google_event_times(ev)
        if times is None:
            continue
        t0, t1 = times
        sliced = slice_event_for_day(t0, t1, day)
        if sliced is not None:
            result.append(sliced)
    return result
