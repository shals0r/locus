"""Schemas for the Integrator chat (Claude Code CLI routing)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class IntegratorMessage(BaseModel):
    """Incoming message to the Integrator."""

    content: str
    session_id: str | None = None
    machine_id: str | None = None
    worker_id: str | None = None


class IntegratorResponse(BaseModel):
    """Response from the Integrator."""

    content: str
    session_id: str
    structured_cards: list[dict] = []
    worker_ready: bool = False


class IntegratorSession(BaseModel):
    """Metadata for a persisted Integrator conversation."""

    session_id: str
    machine_id: str
    worker_id: str | None = None
    created_at: datetime


class IntegratorDeployRequest(BaseModel):
    """Request to deploy a worker from an Integrator session."""

    worker_id: str
    script_path: str
    name: str
    source_type: str
