"""Pydantic schemas for integration worker management."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class WorkerStatus(str, Enum):
    """Possible states for a worker subprocess."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    DEGRADED = "degraded"
    CRASHED = "crashed"
    DISABLED = "disabled"


class WorkerResponse(BaseModel):
    """Worker as returned by the API."""

    id: UUID
    name: str
    source_type: str
    worker_status: str
    is_enabled: bool
    poll_interval_seconds: int
    last_polled_at: datetime | None = None
    failure_count: int
    total_items_ingested: int
    is_builtin: bool
    credential_id: UUID | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkerListResponse(BaseModel):
    """Paginated list of workers."""

    workers: list[WorkerResponse]
    total: int


class WorkerCreate(BaseModel):
    """Schema for creating a new worker."""

    name: str
    source_type: str
    poll_interval_seconds: int = 300
    credential_id: UUID | None = None
    config: dict = {}


class WorkerUpdate(BaseModel):
    """Schema for updating an existing worker."""

    name: str | None = None
    poll_interval_seconds: int | None = None
    credential_id: UUID | None = None
    is_enabled: bool | None = None
    config: dict | None = None


class WorkerLogLine(BaseModel):
    """A single log line from a worker process."""

    timestamp: str
    level: str  # INFO, WARN, ERROR
    message: str


class WorkerActionResponse(BaseModel):
    """Response from a worker action (start/stop/restart)."""

    status: str
    message: str
