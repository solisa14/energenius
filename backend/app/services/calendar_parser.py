"""Timezone-aware helpers for 48-slot home/away availability."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from math import ceil, floor
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from backend.app.models.schemas import DayAvailability

SLOTS_PER_DAY = 48
SLOT_SECONDS = 30 * 60
WORKDAY_START_SLOT = 18
WORKDAY_END_SLOT = 34


def safe_zoneinfo(timezone_name: str | None) -> ZoneInfo:
    candidate = timezone_name or "UTC"
    try:
        return ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _day_bounds(day: date, timezone_name: str | None) -> tuple[datetime, datetime]:
    tz = safe_zoneinfo(timezone_name)
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def _coerce_local_datetime(
    value: Any,
    timezone_name: str | None,
) -> datetime | None:
    if value is None:
        return None
    tz = safe_zoneinfo(timezone_name)
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = str(value).strip()
        if not raw:
            return None
        if len(raw) == 10:
            try:
                parsed = datetime.combine(date.fromisoformat(raw), time.min)
            except ValueError:
                return None
        else:
            try:
                parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tz)
    return parsed.astimezone(tz)


def slot_range_for_interval(
    start: datetime | Any,
    end: datetime | Any,
    day: date,
    timezone_name: str | None,
) -> tuple[int, int] | None:
    local_start = _coerce_local_datetime(start, timezone_name)
    local_end = _coerce_local_datetime(end, timezone_name)
    if local_start is None or local_end is None or local_end <= local_start:
        return None
    day_start, day_end = _day_bounds(day, timezone_name)
    lo = max(local_start, day_start)
    hi = min(local_end, day_end)
    if hi <= lo:
        return None
    i0 = floor((lo - day_start).total_seconds() / SLOT_SECONDS)
    i1 = ceil((hi - day_start).total_seconds() / SLOT_SECONDS)
    return max(0, i0), min(SLOTS_PER_DAY, i1)


def apply_slot_change(
    slots: list[bool],
    start_slot: int,
    end_slot: int,
    set_home: bool,
) -> list[bool]:
    if len(slots) != SLOTS_PER_DAY:
        raise ValueError("slots must have length 48")
    if start_slot < 0 or end_slot > SLOTS_PER_DAY or end_slot <= start_slot:
        raise ValueError("invalid slot range")
    updated = list(slots)
    for idx in range(start_slot, end_slot):
        updated[idx] = set_home
    return updated


def default_slots_for_day(day: date) -> list[bool]:
    slots = [True] * SLOTS_PER_DAY
    if day.weekday() < 5:
        for slot_idx in range(WORKDAY_START_SLOT, WORKDAY_END_SLOT + 1):
            slots[slot_idx] = False
    return slots


def parse_to_availability(
    events: list[dict[str, Any]],
    target_date: date,
    timezone_name: str | None = None,
    starting_slots: list[bool] | None = None,
) -> list[bool]:
    """
    Overlay calendar events onto a day of availability.

    Events mark the user away (`False`) for every touched 30-minute slot.
    """
    slots = list(starting_slots) if starting_slots is not None else [True] * SLOTS_PER_DAY
    if len(slots) != SLOTS_PER_DAY:
        raise ValueError("starting_slots must have length 48")
    for ev in events:
        slot_range = slot_range_for_interval(
            ev.get("start"),
            ev.get("end"),
            target_date,
            timezone_name,
        )
        if slot_range is None:
            continue
        start_slot, end_slot = slot_range
        for idx in range(start_slot, end_slot):
            slots[idx] = False
    return slots


def default_weekly_availability(
    start: date | None = None,
    days: int = 7,
) -> list[DayAvailability]:
    out: list[DayAvailability] = []
    cursor = start or date.today()
    for offset in range(days):
        day = cursor + timedelta(days=offset)
        out.append(DayAvailability(date=day, slots=default_slots_for_day(day)))
    return out
