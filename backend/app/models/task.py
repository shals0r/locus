"""Task model for the task board (Queue/Active/Done).

Tasks can be created directly or promoted from feed items.
Status transitions are enforced by the task service layer.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Task(Base):
    """A task on the board with Queue/Active/Done lifecycle."""

    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    feed_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("feed_items.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500))
    context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tier: Mapped[str] = mapped_column(String(20), default="follow_up")
    status: Mapped[str] = mapped_column(String(20), default="queue")
    machine_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    repo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    branch: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_links: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Optional relationship back to feed item
    feed_item = relationship("FeedItem", lazy="selectin")
