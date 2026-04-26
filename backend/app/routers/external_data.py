from fastapi import APIRouter, Depends, Query

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import ExternalData
from backend.app.services.external_data import get_mock_external_data

router = APIRouter()


@router.get("/external-data", response_model=ExternalData)
def get_external_data(
    zip_code: str = Query(..., alias="zip", min_length=1, description="Home zip (mocked)"),
    date: str = Query(..., min_length=10, description="Date as YYYY-MM-DD"),
    _user_id: str = Depends(get_current_user_id),
) -> ExternalData:
    return get_mock_external_data(zip_code, date)
