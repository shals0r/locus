"""REST endpoints for terminal session CRUD.

Provides HTTP endpoints for creating, listing, and closing terminal
sessions. Terminal I/O is handled via the WebSocket endpoint in
ws/terminal.py.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from locus_agent.auth import verify_token
from locus_agent.terminal.session_pool import session_pool

router = APIRouter(tags=["terminal"])


class CreateTerminalRequest(BaseModel):
    """Request body for creating a new terminal session."""

    cols: int = 120
    rows: int = 40
    working_dir: str | None = None
    tmux_session: str | None = None


class CreateTerminalResponse(BaseModel):
    """Response for terminal creation."""

    session_id: str
    tmux_name: str | None = None


class CloseTerminalResponse(BaseModel):
    """Response for terminal close."""

    status: str = "closed"


class ListTerminalsResponse(BaseModel):
    """Response for listing active terminals."""

    sessions: list[str]


@router.post("/terminal", response_model=CreateTerminalResponse)
async def create_terminal(
    body: CreateTerminalRequest,
    _: None = Depends(verify_token),
) -> CreateTerminalResponse:
    """Create a new terminal session."""
    session_id = os.urandom(8).hex()
    result = await session_pool.create(
        session_id,
        body.cols,
        body.rows,
        working_dir=body.working_dir,
        tmux_session=body.tmux_session,
    )
    return CreateTerminalResponse(
        session_id=session_id,
        tmux_name=result.get("tmux_name"),
    )


@router.delete("/terminal/{session_id}", response_model=CloseTerminalResponse)
async def close_terminal(
    session_id: str,
    _: None = Depends(verify_token),
) -> CloseTerminalResponse:
    """Close a terminal session."""
    await session_pool.close(session_id)
    return CloseTerminalResponse(status="closed")


@router.get("/terminal", response_model=ListTerminalsResponse)
async def list_terminals(
    _: None = Depends(verify_token),
) -> ListTerminalsResponse:
    """List active terminal sessions."""
    return ListTerminalsResponse(sessions=session_pool.list_active())
