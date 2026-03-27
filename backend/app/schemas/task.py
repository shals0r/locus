"""Pydantic schemas for task CRUD and state transitions."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TaskCreate(BaseModel):
    """Schema for creating a new task (manual or promoted from feed)."""

    title: str
    context: str | None = None
    tier: str
    status: str = "queue"
    feed_item_id: str | None = None
    source_links: dict | None = None


class TaskResponse(BaseModel):
    """Task as returned by the API."""

    id: UUID
    feed_item_id: UUID | None = None
    title: str
    context: str | None = None
    tier: str
    status: str
    machine_id: str | None = None
    repo_path: str | None = None
    branch: str | None = None
    source_links: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskTransition(BaseModel):
    """Schema for transitioning a task between states (queue -> active -> done)."""

    status: str
    machine_id: str | None = None
    repo_path: str | None = None
    branch: str | None = None


class TaskUpdate(BaseModel):
    """Partial update for task content."""

    title: str | None = None
    context: str | None = None
