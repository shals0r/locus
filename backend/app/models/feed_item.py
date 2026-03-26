"""FeedItem model for the universal work feed.

Stores items ingested from any source (webhooks, polling adapters,
GSD events). Dedup via composite unique constraint on (source_type, external_id).
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, JSON, String, Text, Boolean, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FeedItem(Base):
    """A single item in the universal work feed."""

    __tablename__ = "feed_items"
    __table_args__ = (
        UniqueConstraint("source_type", "external_id", name="uq_feed_source_external"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    source_type: Mapped[str] = mapped_column(String(50))
    external_id: Mapped[str] = mapped_column(String(500))
    title: Mapped[str] = mapped_column(String(500))
    snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    tier: Mapped[str] = mapped_column(String(20), default="follow_up")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    source_icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    snoozed_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
