"""HVAC threshold schedule (Phase 4)."""

from __future__ import annotations

from backend.app.models.schemas import TimelineSlot


def hvac_schedule(
    outdoor_temps: list[float],
    t_min: int,
    t_max: int,
    availability: list[bool],
) -> list[TimelineSlot]:
    """One-hour cool/heat slots when outside comfort band (Phase 4)."""
    raise NotImplementedError("Phase 4")
