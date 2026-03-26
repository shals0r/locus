import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FeedItem(Base):
    """Universal work feed item ingested from any source."""

    __tablename__ = "feed_items"
    __table_args__ = (
        UniqueConstraint(
            "source_type", "external_id", name="uq_feed_source_external"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    source_type: Mapped[str] = mapped_column(String(50))
    external_id: Mapped[str] = mapped_column(String(500))
    title: Mapped[str] = mapped_column(String(500))
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    url: Mapped[str | None] = mapped_column(
        String(1000), nullable=True, default=None
    )
    tier: Mapped[str] = mapped_column(String(20), default="follow_up")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_payload: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None
    )
    source_icon: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default=None
    )
    snoozed_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
