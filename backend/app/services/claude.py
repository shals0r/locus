"""Claude Code session detection on local and remote machines via tmux.

Supports three detection paths:
1. Agent-based (preferred for local machine when agent is available)
2. SSH-based (remote machines and Docker-mode local)
3. Subprocess-based (native mode local machine)
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import asyncssh

from app.agent.client import AgentClient

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


# ---------------------------------------------------------------------------
# Local (subprocess-based) variants for native mode
# ---------------------------------------------------------------------------


async def detect_claude_sessions_local() -> list[dict]:
    """Detect running Claude Code sessions on the local machine via subprocess.

    Scans all tmux windows for processes with 'claude' in the command name.
    Returns same dict format as the SSH version.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "tmux", "list-windows", "-a", "-F",
            "#{session_name}:#{window_index}:#{window_name}:#{pane_current_command}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return []

        sessions: list[dict] = []
        for line in stdout.decode().strip().split("\n"):
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
    except FileNotFoundError:
        return []  # tmux not installed
    except Exception as exc:
        logger.warning("Failed to detect local Claude sessions: %s", exc)
        return []


async def _read_claude_marker_local() -> dict | None:
    """Read the Claude Code status marker file on the local machine."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "cat", _MARKER_FILE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return None
        data = json.loads(stdout.decode().strip())
        ts = data.get("ts", 0)
        if time.time() - ts > _MARKER_MAX_AGE:
            return None
        return data
    except (json.JSONDecodeError, FileNotFoundError, Exception):
        return None


async def detect_waiting_for_input_local(
    tmux_session: str,
    window_index: int,
) -> bool:
    """Check if a local Claude Code session is waiting for user input."""
    try:
        proc = await asyncio.create_subprocess_shell(
            f"tmux capture-pane -t {tmux_session}:{window_index} -p | tail -5",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return False
        output = stdout.decode().strip()
        waiting_patterns = ["> ", "? ", "waiting for", "approve", "deny"]
        return any(pattern in output.lower() for pattern in waiting_patterns)
    except FileNotFoundError:
        return False
    except Exception as exc:
        logger.warning("Failed to detect local waiting state: %s", exc)
        return False


async def detect_claude_session_status_local(
    tmux_session: str,
    window_index: int,
) -> str:
    """Unified local status detection: returns 'idle', 'running', or 'waiting'.

    Checks marker file first, then falls back to tmux pane pattern matching.
    """
    # Check marker file first
    marker = await _read_claude_marker_local()
    if marker is not None:
        status = marker.get("status")
        if status in ("waiting", "running"):
            return status

    # Fall back to pane capture
    waiting = await detect_waiting_for_input_local(tmux_session, window_index)
    return "waiting" if waiting else "running"


# ---------------------------------------------------------------------------
# Agent-based variants (for host agent path)
# ---------------------------------------------------------------------------


async def detect_claude_sessions_via_agent(
    agent_client: AgentClient,
) -> list[dict]:
    """Detect running Claude Code sessions via the host agent.

    Returns same dict format as the SSH and subprocess versions.
    """
    try:
        return await agent_client.detect_claude_sessions()
    except Exception as exc:
        logger.warning("Failed to detect Claude sessions via agent: %s", exc)
        return []


async def detect_claude_sessions_for_machine(machine_id: str) -> list[dict]:
    """Unified Claude session detection for any machine.

    Routes to the best available detection method:
    1. Agent (if available for the machine)
    2. Subprocess (native mode local machine)
    3. SSH (Docker mode local or remote machines)

    Args:
        machine_id: Machine identifier ("local" or a UUID string).

    Returns:
        List of Claude session dicts with keys: tmux_session, window_index,
        window_name, command, status.
    """
    from app.local.manager import LOCAL_MACHINE_ID, local_machine_manager
    from app.services.machine_registry import get_agent_client_for_machine
    from app.ssh.manager import ssh_manager

    # Try agent first
    agent_client = await get_agent_client_for_machine(machine_id)
    if agent_client is not None:
        return await detect_claude_sessions_via_agent(agent_client)

    # Local machine paths
    if machine_id == LOCAL_MACHINE_ID:
        if local_machine_manager.in_docker:
            conn = await local_machine_manager.get_connection()
            if conn is not None:
                return await detect_claude_sessions(conn)
            return []  # Docker without SSH -- can't detect
        else:
            return await detect_claude_sessions_local()

    # Remote machine via SSH
    conn = await ssh_manager.get_connection(machine_id)
    if conn is not None:
        return await detect_claude_sessions(conn)
    return []
