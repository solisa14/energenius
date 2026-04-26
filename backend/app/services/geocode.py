"""Zip -> (lat, lon) via Open-Meteo Geocoding API.

Open-Meteo is keyless and returns a list of matching places with their
postcode arrays. For a US zip we call the search endpoint, then filter to
results whose `postcodes` list actually contains our zip — otherwise the
numeric query "85718" could match any global place with that id.

Process-lifetime memoization in a plain dict. Zip -> lat/lon is immutable,
so there is no TTL and no eviction.
"""

from __future__ import annotations

import httpx


class GeocodeError(Exception):
    """Raised when the zip cannot be resolved to a lat/lon."""


_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_MEMO: dict[str, tuple[float, float, str]] = {}


async def geocode_zip(zip_code: str, country: str = "US") -> tuple[float, float, str]:
    """Return (lat, lon, place_name) for a US zip. Raises GeocodeError on failure."""
    key = f"{zip_code},{country}"
    if key in _MEMO:
        return _MEMO[key]

    params = {
        "name": zip_code,
        "country": country,
        "count": 10,
        "format": "json",
        "language": "en",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(_GEOCODE_URL, params=params)
        except httpx.HTTPError as exc:
            raise GeocodeError(f"network error: {exc}") from exc

    if resp.status_code != 200:
        raise GeocodeError(f"status {resp.status_code}: {resp.text[:120]}")

    try:
        data = resp.json()
    except ValueError as exc:
        raise GeocodeError(f"invalid json: {exc}") from exc

    results = data.get("results")
    if not isinstance(results, list) or not results:
        raise GeocodeError(f"zip {zip_code!r} not found")

    match: dict | None = None
    for entry in results:
        if not isinstance(entry, dict):
            continue
        if entry.get("country_code") != country:
            continue
        postcodes = entry.get("postcodes")
        if isinstance(postcodes, list) and zip_code in postcodes:
            match = entry
            break
    if match is None:
        first = results[0]
        if isinstance(first, dict) and first.get("country_code") == country:
            match = first
    if match is None:
        raise GeocodeError(f"zip {zip_code!r} did not match any {country} result")

    try:
        lat = float(match["latitude"])
        lon = float(match["longitude"])
    except (KeyError, TypeError, ValueError) as exc:
        raise GeocodeError(f"missing latitude/longitude: {exc}") from exc

    name = str(match.get("name") or zip_code)
    _MEMO[key] = (lat, lon, name)
    return lat, lon, name
