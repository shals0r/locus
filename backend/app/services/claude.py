"""Claude Code session detection on remote machines via tmux."""

from __future__ import annotations

import json
import logging
import time

import asyncssh

logger = logging.getLogger(__name__)

# Marker file written by Claude Code hooks (Stop/PreToolUse)
_MARKER_FILE = "/tmp/.locus-claude-status"
# Marker is trusted if written within this many seconds
_MARKER_MAX_AGE = 300


async def detect_claude_sessions(
    conn: asyncssh.SSHClientConnection,
) -> list[dict]:
    """Detect running Claude Code sessions on a remote machine.

    Scans all tmux windows for processes with 'claude' in the command name.

    Args:
        conn: An active SSH connection.

    Returns:
        List of dicts with keys: tmux_session, window_index, window_name,
        command, status.
    """
    try:
        result = await conn.run(
            "tmux list-windows -a -F '#{session_name}:#{window_index}:#{window_name}:#{pane_current_command}' 2>/dev/null",
            check=True,
        )
        sessions: list[dict] = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split(":")
            if len(parts) >= 4 and "claude" in parts[3].lower():
                sessions.append(
                    {
                        "tmux_session": parts[0],
                        "window_index": int(parts[1]),
                        "window_name": parts[2],
                        "command": parts[3],
                        "status": "running",
                    }
                )
        return sessions
    except asyncssh.ProcessError:
        return []
    except Exception as exc:
        logger.warning("Failed to detect Claude sessions: %s", exc)
        return []


async def _read_claude_marker(
    conn: asyncssh.SSHClientConnection,
) -> dict | None:
    """Read the Claude Code status marker file written by hooks.

    Returns parsed JSON dict or None if file is missing, corrupt, or stale.
    """
    try:
        result = await conn.run(
            f"cat {_MARKER_FILE} 2>/dev/null",
            check=True,
        )
        data = json.loads(result.stdout.strip())
        ts = data.get("ts", 0)
        if time.time() - ts > _MARKER_MAX_AGE:
            return None
        return data
    except (asyncssh.ProcessError, json.JSONDecodeError, Exception):
        return None


async def detect_waiting_for_input(
    conn: asyncssh.SSHClientConnection,
    tmux_session: str,
    window_index: int,
) -> bool:
    """Check if a Claude Code session is waiting for user input.

    Captures the last few lines of the pane and checks for common
    Claude Code prompt patterns.
    """
    try:
        result = await conn.run(
            f"tmux capture-pane -t {tmux_session}:{window_index} -p | tail -5",
            check=True,
        )
        output = result.stdout.strip()
        waiting_patterns = ["> ", "? ", "waiting for", "approve", "deny"]
        return any(pattern in output.lower() for pattern in waiting_patterns)
    except asyncssh.ProcessError:
        return False
    except Exception as exc:
        logger.warning("Failed to detect waiting state: %s", exc)
        return False


async def detect_claude_session_status(
    conn: asyncssh.SSHClientConnection,
    tmux_session: str,
    window_index: int,
) -> str:
    """Unified status detection: returns 'idle', 'running', or 'waiting'.

    Checks marker file first (fast, reliable when hooks configured),
    then falls back to tmux pane pattern matching.
    """
    # Check marker file first (written by Claude Code hooks)
    marker = await _read_claude_marker(conn)
    if marker is not None:
        status = marker.get("status")
        if status in ("waiting", "running"):
            return status

    # Fall back to pane capture
    waiting = await detect_waiting_for_input(conn, tmux_session, window_index)
    return "waiting" if waiting else "running"
