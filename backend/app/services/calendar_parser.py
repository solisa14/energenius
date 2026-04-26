"""Map calendar events to 48 half-hour free slots; default work-week away pattern."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from backend.app.models.schemas import DayAvailability


def _day_start_utcish(d: date) -> datetime:
    return datetime.combine(d, time.min)


def parse_to_availability(events: list[dict[str, Any]]) -> list[bool]:
    """
    48 bools, True = home free. Default all True; busy events clear slots.
    `start` / `end` are ISO-8601 strings.
    """
    slots = [True] * 48
    day0: datetime | None = None
    for ev in events:
        try:
            st = ev.get("start")
            en = ev.get("end")
            if not st or not en:
                continue
            t0 = datetime.fromisoformat(str(st).replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(str(en).replace("Z", "+00:00"))
        except (ValueError, TypeError, AttributeError):
            continue
        if day0 is None:
            d = t0.date()
            day0 = _day_start_utcish(d)
        day_end = day0 + timedelta(hours=24)
        t0c = max(t0, day0)
        t1c = min(t1, day_end)
        if t1c <= t0c:
            continue
        i0 = int((t0c - day0).total_seconds() // 1800)
        i1 = int((t1c - day0 - timedelta(seconds=1)).total_seconds() // 1800) + 1
        for i in range(max(0, i0), min(48, i1)):
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
        slots = [True] * 48
        if d.weekday() < 5:  # Mon-Fri
            for s in range(18, 35):
                slots[s] = False
        out.append(DayAvailability(date=d, slots=slots))
    return out
