"""Pydantic schemas for work feed ingest and CRUD."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class IngestPayload(BaseModel):
    """Payload for the universal feed ingest endpoint."""

    source_type: str
    external_id: str
    title: str
    snippet: str | None = None
    url: str | None = None
    tier_hint: str | None = None
    source_icon: str | None = None
    metadata: dict | None = None


class FeedItemResponse(BaseModel):
    """Feed item as returned by the API."""

    id: UUID
    source_type: str
    external_id: str
    title: str
    snippet: str | None = None
    url: str | None = None
    tier: str
    is_read: bool
    is_dismissed: bool
    raw_payload: dict | None = None
    source_icon: str | None = None
    snoozed_until: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FeedItemUpdate(BaseModel):
    """Partial update for a feed item."""

    is_read: bool | None = None
    is_dismissed: bool | None = None
    snoozed_until: datetime | None = None
    tier: str | None = None


class FeedListResponse(BaseModel):
    """Paginated list of feed items."""

    items: list[FeedItemResponse]
    total: int
