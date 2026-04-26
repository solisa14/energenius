"""Parse calendar events to 48-bool days; default weekly availability (Phase 4)."""

from __future__ import annotations

from typing import Any


def parse_to_availability(events: list[dict[str, Any]]) -> list[bool]:
    """Return 48 half-hour bools, True = free (Phase 4)."""
    raise NotImplementedError("Phase 4")
