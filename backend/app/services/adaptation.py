"""EMA weight updates from user feedback (Phase 4)."""

from __future__ import annotations

from backend.app.models.schemas import FeedbackEvent, UserWeights


def update_user_weights(prev: UserWeights, event: FeedbackEvent) -> UserWeights:
    """Exponential moving average on cost/emissions/satisfaction weights (Phase 4)."""
    raise NotImplementedError("Phase 4")
