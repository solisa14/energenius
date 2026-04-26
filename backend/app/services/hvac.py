# Deliberately simple threshold model for demo scheduling. A real implementation would
# couple to indoor thermal mass, occupancy, and a proper comfort/thermal model.
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from backend.app.models.schemas import TimelineSlot

_COOL_USD_PER_HOUR = 0.45  # ~3 kWh * $0.15
_HEAT_USD_PER_HOUR = 0.60  # ~4 kWh * $0.15
_G_PER_KWH = 500.0


def hvac_schedule(
    outdoor_temps: list[float],
    t_min: int,
    t_max: int,
    availability: list[bool],
    date_iso: str,
) -> list[TimelineSlot]:
    """
    For each hour h: if temp > t_max, cool; if temp < t_min, heat.
    Only if slots[h*2] or slots[h*2+1] is free.
    """
    if len(outdoor_temps) != 24:
        raise ValueError("outdoor_temps must have 24 values")
    if len(availability) != 48:
        raise ValueError("availability must have 48 bools")
    d = date.fromisoformat(date_iso)
    out: list[TimelineSlot] = []
    for h in range(24):
        if not (availability[h * 2] or availability[h * 2 + 1]):
            continue
        temp = outdoor_temps[h]
        if temp > t_max:
            ap = "hvac_cool"
            cost = _COOL_USD_PER_HOUR
            kwh = 3.0
        elif temp < t_min:
            ap = "hvac_heat"
            cost = _HEAT_USD_PER_HOUR
            kwh = 4.0
        else:
            continue
        co2_grams = kwh * _G_PER_KWH
        start = datetime.combine(d, time(hour=h))
        end = start + timedelta(hours=1)
        out.append(
            TimelineSlot(
                start=start,
                end=end,
                appliance=ap,
                cost_usd=cost,
                co2_grams=co2_grams,
                score=0.5,
            )
        )
    return out
