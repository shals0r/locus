"""GSD events REST API endpoint (FEED-06).

Accepts GSD event payloads from the frontend and creates
corresponding feed items so GSD workflow events appear in
the universal work feed.
"""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth import get_current_user
from app.services.gsd_event_service import emit_gsd_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gsd-events", tags=["gsd-events"])

# Accepted GSD event types
VALID_EVENT_TYPES = {
    "phase_planned",
    "phase_executed",
    "phase_verified",
    "gap_found",
    "phase_complete",
}


class GsdEventRequest(BaseModel):
    """Request body for GSD event submission."""

    event_type: str
    repo_path: str
    machine_id: str
    phase: str | None = None
    message: str | None = None


@router.post("")
async def submit_gsd_event(
    body: GsdEventRequest,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Accept a GSD event payload and create a feed item.

    The frontend calls this fire-and-forget after dispatching
    GSD commands in the terminal, so GSD workflow events appear
    in the work feed.
    """
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown event_type: {body.event_type}. "
            f"Must be one of: {', '.join(sorted(VALID_EVENT_TYPES))}",
        )

    details = {
        "phase_name": body.phase or "unknown",
        "phase": body.phase or "unknown",
    }
    if body.message:
        details["summary"] = body.message

    item = await emit_gsd_event(
        db=db,
        event_type=body.event_type,
        repo_path=body.repo_path,
        machine_id=body.machine_id,
        details=details,
    )

    return {"status": "ok", "item_id": str(item.id)}
