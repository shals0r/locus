import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IntegrationSource(Base):
    """Configuration for an external integration source (polling or webhook).

    Extended for Phase 4 with subprocess management fields for the
    worker supervisor (worker_status, failure_count, worker_pid, etc.)
    and multi-instance support (unique constraint removed from source_type).
    """

    __tablename__ = "integration_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), default="")
    source_type: Mapped[str] = mapped_column(String(50))
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

    # Phase 4: Worker subprocess management fields
    worker_script_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    worker_status: Mapped[str] = mapped_column(
        String(20), default="stopped"
    )
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    total_items_ingested: Mapped[int] = mapped_column(Integer, default=0)
    worker_pid: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
