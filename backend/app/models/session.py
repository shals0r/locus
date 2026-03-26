import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TerminalSession(Base):
    """Active terminal session tied to a machine.

    machine_id is a plain string field (no FK constraint) to support both
    the local machine (machine_id="local") and remote machines (UUID strings).
    """

    __tablename__ = "terminal_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    machine_id: Mapped[str] = mapped_column(String(255))
    session_type: Mapped[str] = mapped_column(String(20))
    tmux_session_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    repo_path: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
