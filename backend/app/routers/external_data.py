from fastapi import APIRouter, Depends, Query

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import ExternalDataResponse
from backend.app.services.external_data_real import build_external_data

router = APIRouter()


@router.get("/external-data", response_model=ExternalDataResponse)
async def get_external_data(
    zip_code: str = Query(..., alias="zip", min_length=1, description="Home zip (US, 5 digits)"),
    date: str = Query(..., min_length=10, description="Date as YYYY-MM-DD"),
    _user_id: str = Depends(get_current_user_id),
) -> ExternalDataResponse:
    bundle = await build_external_data(zip_code, date)
    return ExternalDataResponse(
        prices=bundle.external.prices,
        carbon=bundle.external.carbon,
        hourly_temp_f=bundle.external.hourly_temp_f,
        data_source=bundle.meta,
        current_carbon_intensity_g_per_kwh=bundle.current_carbon_g_per_kwh,
    )
