import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IntegrationSource(Base):
    """Configuration for an external integration source (polling or webhook)."""

    __tablename__ = "integration_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    source_type: Mapped[str] = mapped_column(String(50), unique=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    credential_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("credentials.id"), nullable=True, default=None
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    poll_interval_seconds: Mapped[int] = mapped_column(
        Integer, default=300
    )
    webhook_secret: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    last_polled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
