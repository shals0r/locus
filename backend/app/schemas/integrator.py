"""Pydantic schemas for the Integrator chat skill."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class IntegratorMessage(BaseModel):
    """User message to the Integrator skill."""

    content: str
    session_id: str | None = None
    machine_id: UUID | None = None
    worker_id: UUID | None = None  # For editing existing workers


class IntegratorResponse(BaseModel):
    """Response from the Integrator skill."""

    content: str
    session_id: str
    structured_cards: list[dict] = []  # Config steps, test results, deploy actions
    worker_ready: bool = False  # True when deploy card should appear


class IntegratorSession(BaseModel):
    """An active Integrator session."""

    session_id: str
    machine_id: UUID
    worker_id: UUID | None = None
    created_at: datetime
