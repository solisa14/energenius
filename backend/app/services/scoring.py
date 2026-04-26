"""PuLP scoring: score_slot, generate_three_options (Phase 4)."""

from __future__ import annotations

from backend.app.models.schemas import (
    ApplianceConfig,
    RecommendationOption,
    UserWeights,
)


def score_slot(
    start_slot: int,
    appliance: ApplianceConfig,
    prices: list[float],
    carbon: list[float],
    weights: UserWeights,
) -> float:
    """Weighted score for a specific 30-minute start slot (no LP)."""
    raise NotImplementedError("Phase 4: implement PuLP")


def generate_three_options(
    appliances: list[ApplianceConfig],
    prices: list[float],
    carbon: list[float],
    weights: UserWeights,
    circuit_power_limit: float,
    quiet_hours: tuple[int, int],
) -> dict[str, list[RecommendationOption]]:
    """PuLP: options by appliance id, respecting circuit power and quiet hours."""
    raise NotImplementedError("Phase 4: implement PuLP")
