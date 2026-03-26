import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Task(Base):
    """Work task promoted from feed or created manually."""

    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    feed_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("feed_items.id"), nullable=True, default=None
    )
    title: Mapped[str] = mapped_column(String(500))
    context: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    tier: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="queue")
    machine_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    repo_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    branch: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    source_links: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    feed_item = relationship("FeedItem", lazy="selectin")
