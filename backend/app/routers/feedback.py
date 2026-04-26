"""
POST /api/feedback

Data flow (Phase 4):
1. user_id = Depends(get_current_user_id)
2. Insert row into feedback_events (appliance, chosen_option, response, suggested_time).
3. Read current cost/carbon/comfort from profiles; build UserWeights.
4. update_user_weights(prev, event) from adaptation service.
5. Update profiles with new weights.
6. Return { ok: true, updated_weights }.
"""
from typing import Any

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import FeedbackEvent

router = APIRouter()


@router.post("/feedback")
def post_feedback(
    event: FeedbackEvent,
    _user_id: str = Depends(get_current_user_id),
) -> Any:
    raise NotImplementedError("Phase 4")
