"""Terminal session management API."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.machine import Machine
from app.models.session import TerminalSession
from app.schemas.session import SessionCreate, SessionResponse
from app.services.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _session_to_response(session: TerminalSession) -> SessionResponse:
    """Convert a TerminalSession ORM instance to a SessionResponse."""
    return SessionResponse(
        id=str(session.id),
        machine_id=str(session.machine_id),
        session_type=session.session_type,
        tmux_session_name=session.tmux_session_name,
        repo_path=session.repo_path,
        is_active=session.is_active,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    machine_id: str | None = Query(default=None),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    """List all active terminal sessions, optionally filtered by machine."""
    query = select(TerminalSession).where(TerminalSession.is_active.is_(True))
    if machine_id is not None:
        query = query.where(TerminalSession.machine_id == UUID(machine_id))
    result = await db.execute(query)
    sessions = result.scalars().all()
    return [_session_to_response(s) for s in sessions]


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Create a new terminal session bound to a machine.

    The returned session ID is used by the frontend to open a WebSocket
    connection at /ws/terminal/{session_id}.
    """
    # Verify machine exists
    machine = await db.get(Machine, UUID(body.machine_id))
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    session = TerminalSession(
        machine_id=UUID(body.machine_id),
        session_type=body.session_type,
        tmux_session_name=body.tmux_session_name,
        repo_path=body.repo_path,
        is_active=True,
    )
    db.add(session)
    await db.flush()

    return _session_to_response(session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Get a single terminal session by ID."""
    session = await db.get(TerminalSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_response(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Mark a terminal session as inactive."""
    session = await db.get(TerminalSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_active = False
    await db.flush()
