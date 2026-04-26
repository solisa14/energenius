# Threshold model that consumes the real 48-slot prices and carbon arrays, so
# HVAC costs/emissions stay coupled to the same inputs the PuLP optimizer uses.
# Equipment power draws (cool/heat kW) are physical constants, not market data.
from __future__ import annotations

from datetime import datetime, timedelta

from backend.app.models.schemas import TimelineSlot

_COOL_POWER_KW = 3.0
_HEAT_POWER_KW = 4.0


def _slot_sum(values: list[float], hour: int) -> float:
    """Sum the two 30-min slots that make up `hour` (hour in 0..23)."""
    return values[hour * 2] + values[hour * 2 + 1]


def hvac_schedule(
    outdoor_temps: list[float],
    t_min: int,
    t_max: int,
    availability: list[bool],
    base_datetime: datetime,
    prices: list[float],
    carbon: list[float],
) -> list[TimelineSlot]:
    """For each hour h: if temp > t_max cool; if temp < t_min heat.

    Cost and CO2 are computed per-hour against the 48-slot price/carbon arrays
    so HVAC uses the same inputs as the appliance optimizer.

    Units:
      - prices: USD / kWh (length 48, one value per 30-min slot)
      - carbon: kg CO2 / kWh (length 48)
      - outdoor_temps: degrees Fahrenheit (length 24, one value per hour)
    """
    if len(outdoor_temps) != 24:
        raise ValueError("outdoor_temps must have 24 values")
    if len(availability) != 48:
        raise ValueError("availability must have 48 bools")
    if len(prices) != 48 or len(carbon) != 48:
        raise ValueError("prices and carbon must have length 48")

    out: list[TimelineSlot] = []
    for h in range(24):
        if not (availability[h * 2] or availability[h * 2 + 1]):
            continue
        temp = outdoor_temps[h]
        if temp > t_max:
            ap = "hvac_cool"
            power_kw = _COOL_POWER_KW
        elif temp < t_min:
            ap = "hvac_heat"
            power_kw = _HEAT_POWER_KW
        else:
            continue
        # Energy per half-hour slot = 0.5 * power_kw kWh; cost = energy * price.
        cost_usd = 0.5 * power_kw * _slot_sum(prices, h)
        co2_kg = 0.5 * power_kw * _slot_sum(carbon, h)
        co2_grams = max(0.0, co2_kg * 1000.0)
        start = base_datetime + timedelta(hours=h)
        end = start + timedelta(hours=1)
        out.append(
            TimelineSlot(
                start=start,
                end=end,
                appliance=ap,
                cost_usd=cost_usd,
                co2_grams=co2_grams,
                score=0.5,
            )
        )
    return out
