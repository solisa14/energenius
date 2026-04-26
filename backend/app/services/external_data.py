"""Mocked price and carbon curves (48 half-hour slots each).

Prices and carbon forecasts are intentionally kept mocked:
  - Prices: no real API is integrated in the current scope (billing is faked
    per the product spec).
  - Carbon forecast: the Electricity Maps free tier does not support the
    power-breakdown forecast signal, so a real 48-slot forward curve is
    unavailable.
Real data for grid mix + current carbon intensity and real hourly temperatures
live in `external_data_real.py` (orchestrator) and its client modules.
"""

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


def get_mock_external_data(zip_code: str, date_iso: str) -> ExternalData:
    """Return the mocked 48-slot prices and carbon plus a flat 24h temperature curve.

    Callers in the request path should use `external_data_real.build_external_data`
    instead; this helper exists only for offline sanity scripts (e.g. the
    `if __name__ == "__main__":` demo in `scoring.py`).
    """
    del zip_code, date_iso
    return ExternalData(
        prices=list(PRICES),
        carbon=list(CARBON),
        hourly_temp_f=[72.0] * 24,
    )
