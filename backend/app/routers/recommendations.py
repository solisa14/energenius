"""
GET /api/recommendations?date=yyyy-mm-dd

Data flow (Phase 4):
1. user_id = Depends(get_current_user_id) - Supabase JWT verified.
2. get_supabase() with service role; read profiles, appliances, availability for that user and date.
3. get_mock_external_data(home_zip, date) for 48-slot prices/carbon and 24h temp.
4. generate_three_options(...) (PuLP) returns options grouped by appliance id.
5. hvac_schedule(temps, t_min, t_max, availability) for HVAC timeline.
6. get_grid_mix_now(home_zip) for grid mix widget.
7. Build SavingsSummary totals; return DailyRecommendation.
"""
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import DailyRecommendation

router = APIRouter()


@router.get("/recommendations", response_model=DailyRecommendation)
def get_recommendations(
    date_param: date | None = Query(None, alias="date", description="ISO date; default today"),
    _user_id: str = Depends(get_current_user_id),
) -> Any:
    raise NotImplementedError("Phase 4")
