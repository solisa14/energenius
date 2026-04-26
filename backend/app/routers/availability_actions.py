"""Resolve pending availability clarification actions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.auth import get_current_user_id
from backend.app.models.schemas import (
    AvailabilityActionReplyRequest,
    AvailabilityActionReplyResponse,
)
from backend.app.services.availability_assistant import respond_to_action

router = APIRouter()


@router.post(
    "/availability-actions/{action_id}/respond",
    response_model=AvailabilityActionReplyResponse,
)
async def post_availability_action_response(
    action_id: str,
    body: AvailabilityActionReplyRequest,
    user_id: str = Depends(get_current_user_id),
) -> AvailabilityActionReplyResponse:
    try:
        return await respond_to_action(
            user_id,
            action_id,
            resolution=body.resolution,
            message=body.message,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
