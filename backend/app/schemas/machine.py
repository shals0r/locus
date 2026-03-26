"""Pydantic schemas for machine CRUD operations."""

from pydantic import BaseModel, Field
from typing import Optional


class MachineCreate(BaseModel):
    """Schema for creating a new SSH machine."""

    name: str = Field(min_length=1, max_length=100)
    host: str = Field(min_length=1)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(min_length=1)
    ssh_key_path: str = Field(min_length=1)
    ssh_key_passphrase: Optional[str] = None
    repo_scan_paths: list[str] = Field(default_factory=list)


class MachineUpdate(BaseModel):
    """Schema for updating an existing machine."""

    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_key_passphrase: Optional[str] = None
    repo_scan_paths: Optional[list[str]] = None


class MachineResponse(BaseModel):
    """Schema for machine API responses."""

    id: str
    name: str
    host: str
    port: int
    username: str
    ssh_key_path: str
    repo_scan_paths: list[str]
    status: str  # "online" | "offline" | "reconnecting" | "needs_setup"

    model_config = {"from_attributes": True}


class TestConnectionRequest(BaseModel):
    """Schema for SSH connection test request."""

    host: str
    port: int = 22
    username: str
    ssh_key_path: str
    ssh_key_passphrase: Optional[str] = None


class TestConnectionResponse(BaseModel):
    """Schema for SSH connection test response."""

    success: bool
    message: str
    tmux_sessions: list[dict] = []


class TmuxSessionItem(BaseModel):
    """Schema for a single tmux session."""

    name: str
    attached: bool
    last_activity: str


class TmuxSessionsResponse(BaseModel):
    """Schema for listing tmux sessions."""

    sessions: list[TmuxSessionItem]


class TmuxCreateResponse(BaseModel):
    """Schema for tmux session creation result."""

    session_name: str
