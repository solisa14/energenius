"""Map calendar events to 48 half-hour free slots; default work-week away pattern."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from math import ceil, floor
from typing import Any

from backend.app.models.schemas import DayAvailability

SLOTS_PER_DAY = 48
SLOT_SECONDS = 30 * 60
WORKDAY_START_SLOT = 18
WORKDAY_END_SLOT = 34


def _day_start_utcish(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def parse_to_availability(events: list[dict[str, Any]]) -> list[bool]:
    """
    48 bools, True = home free. Default all True; busy events clear slots.
    `start` / `end` are ISO-8601 strings.
    """
    slots = [True] * SLOTS_PER_DAY
    day0: datetime | None = None
    for ev in events:
        t0 = _parse_iso_datetime(ev.get("start"))
        t1 = _parse_iso_datetime(ev.get("end"))
        if t0 is None or t1 is None:
            continue
        if day0 is None:
            day0 = _day_start_utcish(t0.date())
        day_end = day0 + timedelta(hours=24)
        t0c = max(t0, day0)
        t1c = min(t1, day_end)
        if t1c <= t0c:
            continue
        i0 = floor((t0c - day0).total_seconds() / SLOT_SECONDS)
        i1 = ceil((t1c - day0).total_seconds() / SLOT_SECONDS)
        for i in range(max(0, i0), min(SLOTS_PER_DAY, i1)):
            slots[i] = False
    return slots


def default_weekly_availability() -> list[DayAvailability]:
    """
    Next 7 calendar days: weekdays 9-5 away (slots 18-34 false), weekends all free.
    """
    out: list[DayAvailability] = []
    start = date.today()
    for n in range(7):
        d = start + timedelta(days=n)
        slots = [True] * SLOTS_PER_DAY
        if d.weekday() < 5:  # Mon-Fri
            for s in range(WORKDAY_START_SLOT, WORKDAY_END_SLOT + 1):
                slots[s] = False
        out.append(DayAvailability(date=d, slots=slots))
    return out
