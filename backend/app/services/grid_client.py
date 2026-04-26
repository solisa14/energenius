"""Electricity Maps API client.

Hits /v3/power-breakdown/latest (grid mix) and /v3/carbon-intensity/latest
(current carbon intensity) for a given lat/lon. Free tier supports these two
endpoints; forecast is not available and is intentionally not called.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from backend.app.config import get_settings


class GridError(Exception):
    """Raised when the grid data cannot be fetched."""


_POWER_BREAKDOWN_URL = "https://api.electricitymap.org/v3/power-breakdown/latest"
_CARBON_INTENSITY_URL = "https://api.electricitymap.org/v3/carbon-intensity/latest"

# Map Electricity Maps' fine-grained production keys down to the eight the
# frontend GridMixWidget knows how to render. Anything unknown folds into "other".
_KEY_MAP: dict[str, str] = {
    "nuclear": "nuclear",
    "solar": "solar",
    "wind": "wind",
    "hydro": "hydro",
    "hydro discharge": "hydro",
    "hydro_discharge": "hydro",
    "gas": "gas",
    "coal": "coal",
    "oil": "oil",
    "biomass": "other",
    "geothermal": "other",
    "battery discharge": "other",
    "battery_discharge": "other",
    "unknown": "other",
}


@dataclass
class GridSnapshot:
    mix: dict[str, float]  # keys in _KEY_MAP values, fractions summing to ~1.0
    carbon_g_per_kwh: float
    zone: str


def _normalize_mix(breakdown: dict[str, float], total: float) -> dict[str, float]:
    """Convert absolute MW values to fractions and fold to frontend's key set."""
    if total <= 0:
        raise GridError(f"non-positive total power: {total}")
    out: dict[str, float] = {
        "nuclear": 0.0,
        "solar": 0.0,
        "wind": 0.0,
        "hydro": 0.0,
        "gas": 0.0,
        "coal": 0.0,
        "oil": 0.0,
        "other": 0.0,
    }
    for raw_key, raw_val in breakdown.items():
        if raw_val is None:
            continue
        try:
            val = float(raw_val)
        except (TypeError, ValueError):
            continue
        if val <= 0:
            continue
        mapped = _KEY_MAP.get(str(raw_key).lower(), "other")
        out[mapped] += val / total
    return out


async def fetch_current_grid(lat: float, lon: float) -> GridSnapshot:
    """Fetch power breakdown + carbon intensity for (lat, lon). Raises GridError."""
    settings = get_settings()
    if not settings.electricity_maps_api_key:
        raise GridError("ELECTRICITY_MAPS_API_KEY is not configured")

    headers = {"auth-token": settings.electricity_maps_api_key}
    params = {"lat": lat, "lon": lon}

    async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
        try:
            breakdown_resp = await client.get(_POWER_BREAKDOWN_URL, params=params)
            carbon_resp = await client.get(_CARBON_INTENSITY_URL, params=params)
        except httpx.HTTPError as exc:
            raise GridError(f"network error: {exc}") from exc

    if breakdown_resp.status_code != 200:
        raise GridError(
            f"power-breakdown status {breakdown_resp.status_code}: {breakdown_resp.text[:120]}"
        )
    if carbon_resp.status_code != 200:
        raise GridError(
            f"carbon-intensity status {carbon_resp.status_code}: {carbon_resp.text[:120]}"
        )

    try:
        breakdown_data = breakdown_resp.json()
        carbon_data = carbon_resp.json()
    except ValueError as exc:
        raise GridError(f"invalid json: {exc}") from exc

    breakdown = breakdown_data.get("powerConsumptionBreakdown")
    total = breakdown_data.get("powerConsumptionTotal")
    if not isinstance(breakdown, dict) or total is None:
        raise GridError(f"missing powerConsumptionBreakdown/Total: {breakdown_data}")

    try:
        total_f = float(total)
    except (TypeError, ValueError) as exc:
        raise GridError(f"invalid total: {exc}") from exc

    mix = _normalize_mix(breakdown, total_f)

    try:
        carbon_g = float(carbon_data["carbonIntensity"])
    except (KeyError, TypeError, ValueError) as exc:
        raise GridError(f"missing carbonIntensity: {exc}") from exc

    zone = str(breakdown_data.get("zone") or carbon_data.get("zone") or "")

    return GridSnapshot(mix=mix, carbon_g_per_kwh=carbon_g, zone=zone)
