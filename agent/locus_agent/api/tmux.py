"""Tmux session management REST endpoints for the Locus host agent.

Provides list, create, check, and kill operations for tmux sessions
on the local machine. All endpoints require Bearer token auth.
"""

from __future__ import annotations

import asyncio
import os
import sys

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from locus_agent.auth import verify_token

router = APIRouter(tags=["tmux"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _run_tmux(*args: str) -> tuple[int, str, str]:
    """Run a tmux command via asyncio subprocess.

    Returns:
        Tuple of (returncode, stdout, stderr).
        Returns (1, "", "tmux not found") if tmux binary is missing.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "tmux", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await proc.communicate()
        return (
            proc.returncode or 0,
            stdout_bytes.decode() if stdout_bytes else "",
            stderr_bytes.decode() if stderr_bytes else "",
        )
    except FileNotFoundError:
        return (1, "", "tmux not found")


def _is_windows() -> bool:
    return sys.platform == "win32"


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class TmuxSession(BaseModel):
    name: str
    attached: bool
    last_activity: int


class SessionListResponse(BaseModel):
    sessions: list[TmuxSession]
    tmux_available: bool


class CreateSessionRequest(BaseModel):
    name: str | None = None
    working_dir: str | None = None


class CreateSessionResponse(BaseModel):
    name: str
    created: bool


class SessionExistsResponse(BaseModel):
    name: str
    exists: bool


class KillSessionResponse(BaseModel):
    name: str
    killed: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/tmux/sessions", response_model=SessionListResponse)
async def list_sessions(_: None = Depends(verify_token)) -> SessionListResponse:
    """List all tmux sessions on the host."""
    if _is_windows():
        return SessionListResponse(sessions=[], tmux_available=False)

    returncode, stdout, stderr = await _run_tmux(
        "ls", "-F", "#{session_name}:#{session_attached}:#{session_activity}",
    )

    if returncode != 0:
        # tmux not found, or no server running
        return SessionListResponse(sessions=[], tmux_available="tmux not found" not in stderr)

    sessions: list[TmuxSession] = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split(":")
        if len(parts) >= 3:
            sessions.append(TmuxSession(
                name=parts[0],
                attached=int(parts[1]) > 0,
                last_activity=int(parts[2]),
            ))

    return SessionListResponse(sessions=sessions, tmux_available=True)


@router.post(
    "/tmux/sessions",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    body: CreateSessionRequest,
    _: None = Depends(verify_token),
) -> CreateSessionResponse:
    """Create a new detached tmux session."""
    if _is_windows():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="tmux not available on Windows",
        )

    name = body.name or f"locus-{os.urandom(4).hex()}"

    # Check if session already exists
    rc_check, _, _ = await _run_tmux("has-session", "-t", name)
    if rc_check == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session '{name}' already exists",
        )

    # Build create command args
    args = ["new-session", "-d", "-s", name]
    if body.working_dir:
        args.extend(["-c", body.working_dir])

    returncode, _, stderr = await _run_tmux(*args)
    if returncode != 0:
        if "tmux not found" in stderr:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="tmux not available on this system",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {stderr.strip()}",
        )

    return CreateSessionResponse(name=name, created=True)


@router.get("/tmux/sessions/{name}", response_model=SessionExistsResponse)
async def check_session(
    name: str,
    _: None = Depends(verify_token),
) -> SessionExistsResponse:
    """Check if a tmux session exists."""
    if _is_windows():
        return SessionExistsResponse(name=name, exists=False)

    returncode, _, _ = await _run_tmux("has-session", "-t", name)
    return SessionExistsResponse(name=name, exists=returncode == 0)


@router.delete("/tmux/sessions/{name}", response_model=KillSessionResponse)
async def kill_session(
    name: str,
    _: None = Depends(verify_token),
) -> KillSessionResponse:
    """Kill a tmux session by name."""
    if _is_windows():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="tmux not available on Windows",
        )

    returncode, _, stderr = await _run_tmux("kill-session", "-t", name)
    if returncode != 0:
        if "tmux not found" in stderr:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="tmux not available on this system",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{name}' not found",
        )

    return KillSessionResponse(name=name, killed=True)
