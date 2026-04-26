"""Orchestrator that combines real external APIs with the mocked fallbacks.

Returns an assembled `ExternalData` + `GridMixSnapshot` + current carbon
intensity + `DataSourceMeta`. Fail-and-flag: every failure degrades the
response but never raises to the caller. Callers get a populated payload
with `data_source` set to "real", "partial", or "mock" and a list of
warnings describing exactly what went wrong.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from backend.app.models.schemas import DataSourceMeta, ExternalData, GridMixSnapshot
from backend.app.services.external_data import CARBON, PRICES
from backend.app.services.geocode import GeocodeError, geocode_zip
from backend.app.services.grid_client import GridError, fetch_current_grid
from backend.app.services.weather_client import WeatherError, fetch_hourly_temp_f

# Tucson, AZ — used only when geocoding fails so the UI still renders.
_FALLBACK_LAT = 32.2226
_FALLBACK_LON = -110.9747

# Mock 24h temperature curve used when OpenWeatherMap fails. Kept here so the
# main `external_data.py` constants stay narrow.
_MOCK_HOURLY_TEMP_F: list[float] = [
    68.0, 67.0, 66.0, 65.0, 65.0, 66.0, 70.0, 75.0,
    80.0, 85.0, 89.0, 92.0, 94.0, 95.0, 95.0, 93.0,
    90.0, 86.0, 82.0, 78.0, 75.0, 72.0, 70.0, 69.0,
]

# Fallback grid mix used when Electricity Maps fails.
_MOCK_GRID_MIX: GridMixSnapshot = {
    "nuclear": 0.22,
    "gas": 0.40,
    "wind": 0.18,
    "solar": 0.12,
    "hydro": 0.05,
    "coal": 0.03,
}

# Forecast is unavailable on the Electricity Maps free tier; prices are not
# sourced from any external API in the current scope. These two warnings are
# always present when we successfully fetch real data — they describe known,
# permanent mocking in the pipeline.
_ALWAYS_MOCKED = ["carbon_forecast_mocked", "prices_mocked"]


@dataclass
class ExternalBundle:
    external: ExternalData
    grid_mix: GridMixSnapshot
    current_carbon_g_per_kwh: float | None
    meta: DataSourceMeta


async def build_external_data(zip_code: str, _date_iso: str) -> ExternalBundle:
    warnings: list[str] = []
    grid_zone: str | None = None
    weather_ok = False
    grid_ok = False

    try:
        lat, lon, _ = await geocode_zip(zip_code)
        geocode_ok = True
    except GeocodeError as exc:
        warnings.append(f"geocode_failed: {exc}")
        lat, lon = _FALLBACK_LAT, _FALLBACK_LON
        geocode_ok = False

    hourly_temp_f: list[float] = list(_MOCK_HOURLY_TEMP_F)
    if geocode_ok:
        try:
            hourly_temp_f = await fetch_hourly_temp_f(lat, lon)
            weather_ok = True
        except WeatherError as exc:
            warnings.append(f"weather_failed: {exc}")

    grid_mix: GridMixSnapshot = dict(_MOCK_GRID_MIX)
    current_carbon_g: float | None = None
    if geocode_ok:
        try:
            snap = await fetch_current_grid(lat, lon)
            grid_mix = snap.mix
            current_carbon_g = snap.carbon_g_per_kwh
            grid_zone = snap.zone or None
            grid_ok = True
        except GridError as exc:
            warnings.append(f"grid_failed: {exc}")

    if geocode_ok and weather_ok and grid_ok:
        tier = "real"
    elif weather_ok or grid_ok:
        tier = "partial"
    else:
        tier = "mock"

    warnings.extend(_ALWAYS_MOCKED)

    external = ExternalData(
        prices=list(PRICES),
        carbon=list(CARBON),
        hourly_temp_f=hourly_temp_f,
    )

    meta = DataSourceMeta(
        data_source=tier,
        warnings=warnings,
        fetched_at=datetime.now(tz=timezone.utc),
        grid_zone=grid_zone,
    )

    return ExternalBundle(
        external=external,
        grid_mix=grid_mix,
        current_carbon_g_per_kwh=current_carbon_g,
        meta=meta,
    )
