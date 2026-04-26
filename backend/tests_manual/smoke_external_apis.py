"""Manual end-to-end smoke test for the external API integration.

Usage:
    python -m backend.tests_manual.smoke_external_apis 85718

Requires OPENWEATHERMAP_API_KEY and ELECTRICITY_MAPS_API_KEY in the .env file
(project root or backend/.env). Prints the results of every outbound call and
the final assembled bundle so a human can eyeball sanity (e.g. Tucson in April
should be 70-95 F, AZ grid carbon intensity usually 350-550 gCO2/kWh).
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone

from backend.app.services.external_data_real import build_external_data
from backend.app.services.geocode import GeocodeError, geocode_zip
from backend.app.services.grid_client import GridError, fetch_current_grid
from backend.app.services.weather_client import WeatherError, fetch_hourly_temp_f


def _header(label: str) -> None:
    print()
    print("=" * 60)
    print(label)
    print("=" * 60)


async def _run(zip_code: str) -> int:
    _header(f"1. Geocoding zip={zip_code}")
    try:
        lat, lon, name = await geocode_zip(zip_code)
        print(f"  -> lat={lat}, lon={lon}, name={name!r}")
    except GeocodeError as exc:
        print(f"  FAIL: {exc}")
        return 1

    _header("2. OpenWeatherMap hourly temperatures (first 24h, Fahrenheit)")
    try:
        temps = await fetch_hourly_temp_f(lat, lon)
    except WeatherError as exc:
        print(f"  FAIL: {exc}")
        temps = None
    if temps is not None:
        for h, t in enumerate(temps):
            print(f"  h+{h:02d}: {t:6.2f} F")

    _header("3. Electricity Maps power breakdown + carbon intensity (latest)")
    try:
        snap = await fetch_current_grid(lat, lon)
    except GridError as exc:
        print(f"  FAIL: {exc}")
        snap = None
    if snap is not None:
        total_frac = sum(snap.mix.values())
        print(f"  zone              = {snap.zone}")
        print(f"  carbon_g_per_kwh  = {snap.carbon_g_per_kwh}")
        print(f"  mix sum (should ≈ 1.0) = {total_frac:.4f}")
        for key, frac in snap.mix.items():
            print(f"    {key:8s} {frac * 100:6.2f}%")

    _header("4. Assembled bundle from build_external_data")
    bundle = await build_external_data(zip_code, datetime.now(tz=timezone.utc).date().isoformat())
    summary = {
        "data_source": bundle.meta.data_source,
        "warnings": bundle.meta.warnings,
        "grid_zone": bundle.meta.grid_zone,
        "fetched_at": bundle.meta.fetched_at.isoformat(),
        "current_carbon_g_per_kwh": bundle.current_carbon_g_per_kwh,
        "grid_mix": bundle.grid_mix,
        "first_4_temps_f": bundle.external.hourly_temp_f[:4],
        "first_4_prices_usd_per_kwh": bundle.external.prices[:4],
        "first_4_carbon_kg_per_kwh": bundle.external.carbon[:4],
    }
    print(json.dumps(summary, indent=2, default=str))
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m backend.tests_manual.smoke_external_apis <US_ZIP>")
        return 2
    zip_code = sys.argv[1].strip()
    return asyncio.run(_run(zip_code))


if __name__ == "__main__":
    sys.exit(main())
