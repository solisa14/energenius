# Replace these constants with calls to OpenEI / Electricity Maps / OpenWeatherMap
# when integrating real data — the function signatures stay the same.

from __future__ import annotations

from backend.app.models.schemas import ExternalData

PRICES: list[float] = [
    0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11,
    0.11, 0.11, 0.11, 0.11, 0.20, 0.205, 0.21, 0.215,
    0.22, 0.225, 0.24, 0.237, 0.234, 0.231, 0.229, 0.226,
    0.223, 0.22, 0.217, 0.214, 0.211, 0.209, 0.206, 0.203,
    0.28, 0.294, 0.308, 0.322, 0.336, 0.35, 0.364, 0.378,
    0.392, 0.406, 0.22, 0.21, 0.20, 0.19, 0.18, 0.17,
]

CARBON: list[float] = [
    0.4, 0.398, 0.397, 0.395, 0.393, 0.392, 0.39, 0.388,
    0.387, 0.385, 0.383, 0.382, 0.38, 0.367, 0.355, 0.343,
    0.33, 0.318, 0.305, 0.292, 0.28, 0.27, 0.26, 0.25,
    0.24, 0.23, 0.22, 0.21, 0.20, 0.19, 0.18, 0.20,
    0.22, 0.24, 0.26, 0.28, 0.30, 0.327, 0.353, 0.38,
    0.407, 0.433, 0.46, 0.45, 0.44, 0.43, 0.42, 0.41,
]

HOURLY_TEMP_F: list[int] = [
    68,
    67,
    66,
    65,
    65,
    66,
    70,
    75,
    80,
    85,
    89,
    92,
    94,
    95,
    95,
    93,
    90,
    86,
    82,
    78,
    75,
    72,
    70,
    69,
]

GRID_MIX_NOW: dict[str, float] = {
    "nuclear": 0.22,
    "gas": 0.40,
    "wind": 0.18,
    "solar": 0.12,
    "hydro": 0.05,
    "coal": 0.03,
}


def get_mock_external_data(_zip_code: str, _date_iso: str) -> ExternalData:
    """Return hardcoded 48-slot curves (mocked). `zip` and `date` are accepted for future real APIs."""
    return ExternalData(
        prices=list(PRICES),
        carbon=list(CARBON),
        hourly_temp_f=[float(x) for x in HOURLY_TEMP_F],
    )


def get_grid_mix_now(_zip_code: str) -> dict[str, float]:
    return dict(GRID_MIX_NOW)
