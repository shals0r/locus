"""Pydantic schemas for terminal session management."""

from pydantic import BaseModel
from typing import Optional


class SessionCreate(BaseModel):
    """Schema for creating a new terminal session."""

    machine_id: str
    session_type: str = "shell"  # "shell" or "claude"
    tmux_session_name: Optional[str] = None
    repo_path: Optional[str] = None


class SessionResponse(BaseModel):
    """Schema for terminal session API responses."""

    id: str
    machine_id: str
    session_type: str
    tmux_session_name: Optional[str]
    repo_path: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}
