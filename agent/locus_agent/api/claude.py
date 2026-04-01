"""Claude Code session detection endpoint for the Locus host agent.

Detects running Claude Code sessions by scanning tmux panes for processes
with 'claude' in the command name, and optionally reads a marker file
for detailed status information.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from locus_agent.auth import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["claude"])

# Marker file written by Claude Code hooks (Stop/PreToolUse)
MARKER_FILE = "/tmp/.locus-claude-status"
# Marker is trusted if written within this many seconds
MARKER_MAX_AGE = 300


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class ClaudeSession(BaseModel):
    tmux_session: str
    window_index: int
    window_name: str
    command: str
    status: str


class ClaudeSessionsResponse(BaseModel):
    sessions: list[ClaudeSession]
    detection_available: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_marker_file() -> dict | None:
    """Read the Claude Code status marker file.

    Returns parsed JSON dict or None if file is missing, corrupt, or stale.
    """
    try:
        if not os.path.exists(MARKER_FILE):
            return None
        stat = os.stat(MARKER_FILE)
        if time.time() - stat.st_mtime > MARKER_MAX_AGE:
            return None
        with open(MARKER_FILE) as f:
            data = json.load(f)
        ts = data.get("ts", 0)
        if time.time() - ts > MARKER_MAX_AGE:
            return None
        return data
    except (json.JSONDecodeError, OSError, Exception):
        return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/claude/sessions", response_model=ClaudeSessionsResponse)
async def detect_claude_sessions(
    _: None = Depends(verify_token),
) -> ClaudeSessionsResponse:
    """Detect running Claude Code sessions via tmux pane scanning.

    Scans all tmux windows for processes with 'claude' in the command name.
    Optionally merges status from the marker file at /tmp/.locus-claude-status.
    """
    if sys.platform == "win32":
        return ClaudeSessionsResponse(sessions=[], detection_available=False)

    try:
        proc = await asyncio.create_subprocess_exec(
            "tmux", "list-windows", "-a", "-F",
            "#{session_name}:#{window_index}:#{window_name}:#{pane_current_command}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, _ = await proc.communicate()
        if proc.returncode != 0:
            return ClaudeSessionsResponse(sessions=[], detection_available=False)
    except FileNotFoundError:
        return ClaudeSessionsResponse(sessions=[], detection_available=False)

    # Read marker file for status enrichment
    marker = _read_marker_file()
    marker_status = None
    if marker is not None:
        marker_status = marker.get("status")

    sessions: list[ClaudeSession] = []
    for line in stdout_bytes.decode().strip().split("\n"):
        if not line:
            continue
        parts = line.split(":")
        if len(parts) >= 4 and "claude" in parts[3].lower():
            # Determine status: use marker if available, else "running"
            session_status = "running"
            if marker_status and marker_status in ("waiting_for_input", "waiting", "running", "idle"):
                session_status = marker_status

            sessions.append(ClaudeSession(
                tmux_session=parts[0],
                window_index=int(parts[1]),
                window_name=parts[2],
                command=parts[3],
                status=session_status,
            ))

    return ClaudeSessionsResponse(sessions=sessions, detection_available=True)
