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


def _profile_weight(data: dict[str, object], primary: str, legacy: str, default: float) -> float:
    value = data.get(primary, data.get(legacy, default))
    return float(value)


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
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    data = pr.data or {}
    c = _profile_weight(data, "cost_weight", "cost_weight", 0.4)
    e = _profile_weight(data, "emissions_weight", "carbon_weight", 0.2)
    s = _profile_weight(data, "satisfaction_weight", "comfort_weight", 0.4)
    prev = _normalize(c, e, s)
    updated = update_user_weights(prev, event)
    patch: dict[str, float] = {"cost_weight": updated.cost}
    patch[
        "emissions_weight" if "emissions_weight" in data else "carbon_weight"
    ] = updated.emissions
    patch[
        "satisfaction_weight" if "satisfaction_weight" in data else "comfort_weight"
    ] = updated.satisfaction
    supabase.table("profiles").update(patch).eq("id", user_id).execute()
    return FeedbackResponse(ok=True, updated_weights=updated)
