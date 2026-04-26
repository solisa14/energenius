"""
POST /api/feedback — persist event, EMA-update weights, return updated triple.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.auth import get_current_user_id
from backend.app.database import get_supabase
from backend.app.models.schemas import (
    FeedbackEvent,
    FeedbackResponse,
    UserWeights,
)
from backend.app.services.adaptation import update_user_weights

router = APIRouter()


def _normalize(c: float, e: float, s: float) -> UserWeights:
    t = c + e + s
    if t <= 0:
        return UserWeights(cost=0.4, emissions=0.2, satisfaction=0.4)
    return UserWeights(cost=c / t, emissions=e / t, satisfaction=s / t)


@router.post("/feedback", response_model=FeedbackResponse)
def post_feedback(
    event: FeedbackEvent,
    user_id: str = Depends(get_current_user_id),
) -> FeedbackResponse:
    supabase = get_supabase()
    ins = {
        "user_id": user_id,
        "appliance": event.appliance,
        "chosen_option": event.chosen_option,
        "response": event.response,
        "suggested_time": event.suggested_time.isoformat()
        if event.suggested_time
        else None,
    }
    supabase.table("feedback_events").insert(ins).execute()
    pr = (
        supabase.table("profiles")
        .select("cost_weight,emissions_weight,satisfaction_weight")
        .eq("id", user_id)
        .single()
        .execute()
    )
    data = pr.data
    c = float((data or {}).get("cost_weight", 0.4))
    e = float((data or {}).get("emissions_weight", 0.2))
    s = float((data or {}).get("satisfaction_weight", 0.4))
    prev = _normalize(c, e, s)
    updated = update_user_weights(prev, event)
    supabase.table("profiles").update(
        {
            "cost_weight": updated.cost,
            "emissions_weight": updated.emissions,
            "satisfaction_weight": updated.satisfaction,
        }
    ).eq("id", user_id).execute()
    return FeedbackResponse(ok=True, updated_weights=updated)
