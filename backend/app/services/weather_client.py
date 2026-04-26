"""Open-Meteo hourly forecast client.

Returns 24 hourly forecast temperatures in degrees Fahrenheit, starting from
the current hour (rolling 24h horizon). Open-Meteo is keyless and free for
non-commercial use.
"""

from __future__ import annotations

import httpx


class WeatherError(Exception):
    """Raised when hourly temperatures cannot be fetched."""


_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_hourly_temp_f(lat: float, lon: float) -> list[float]:
    """Fetch 24 hourly temperatures (°F) starting from the current hour."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m",
        "temperature_unit": "fahrenheit",
        "forecast_hours": 24,
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(_FORECAST_URL, params=params)
        except httpx.HTTPError as exc:
            raise WeatherError(f"network error: {exc}") from exc

    if resp.status_code != 200:
        raise WeatherError(f"status {resp.status_code}: {resp.text[:120]}")

    try:
        data = resp.json()
    except ValueError as exc:
        raise WeatherError(f"invalid json: {exc}") from exc

    hourly = data.get("hourly")
    if not isinstance(hourly, dict):
        raise WeatherError(f"hourly missing: {data}")

    values = hourly.get("temperature_2m")
    if not isinstance(values, list) or len(values) < 24:
        raise WeatherError(f"temperature_2m missing or too short (got {len(values) if isinstance(values, list) else 'none'})")

    temps: list[float] = []
    for idx, entry in enumerate(values[:24]):
        try:
            temps.append(float(entry))
        except (TypeError, ValueError) as exc:
            raise WeatherError(f"entry {idx} not numeric: {exc}") from exc

    return temps
