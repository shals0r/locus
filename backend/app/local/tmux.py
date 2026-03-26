"""Local tmux session management via subprocess (native mode).

Mirrors the function signatures from ssh/tmux.py but uses
asyncio.create_subprocess_exec instead of an SSH connection.
Used when the backend runs directly on the host (not in Docker).
"""

from __future__ import annotations

import asyncio
import re
from uuid import uuid4


def _sanitize_tmux_name(raw: str) -> str:
    """Sanitize a string for use as a tmux session name.

    Tmux disallows periods and colons in session names.
    """
    name = re.sub(r"[.:\s]+", "-", raw)
    name = re.sub(r"-+", "-", name)
    name = name.strip("-")
    return name[:50]


async def _detect_git_branch_local(working_dir: str) -> str | None:
    """Detect the current git branch in a directory on the local machine."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", working_dir, "rev-parse", "--abbrev-ref", "HEAD",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return None
        branch = stdout.decode().strip()
        return branch if branch and branch != "HEAD" else None
    except FileNotFoundError:
        return None  # git not installed


async def _resolve_name_collision_local(base_name: str) -> str:
    """Append a short suffix if a tmux session with base_name already exists."""
    if not await check_tmux_session_exists_local(base_name):
        return base_name
    return f"{base_name}-{uuid4().hex[:4]}"


async def _generate_local_session_name(working_dir: str | None) -> str:
    """Generate a human-readable tmux session name from dir + git branch."""
    if not working_dir:
        return f"locus-{uuid4().hex[:8]}"

    dirname = working_dir.rstrip("/").split("/")[-1]
    branch = await _detect_git_branch_local(working_dir)

    if branch:
        raw = f"{dirname}-{branch}"
    else:
        raw = dirname

    base = _sanitize_tmux_name(raw)
    if not base:
        return f"locus-{uuid4().hex[:8]}"

    return await _resolve_name_collision_local(base)


async def list_tmux_sessions_local() -> list[dict[str, str | bool | int]]:
    """List tmux sessions on the local machine.

    Returns:
        List of dicts with keys: name (str), attached (bool), last_activity (int).
        Returns empty list if tmux is not installed or no server is running.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "tmux", "ls", "-F",
            "#{session_name}:#{session_attached}:#{session_activity}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            return []

        sessions: list[dict[str, str | bool | int]] = []
        for line in stdout.decode().strip().split("\n"):
            if not line:
                continue
            parts = line.split(":")
            if len(parts) >= 3:
                sessions.append({
                    "name": parts[0],
                    "attached": int(parts[1]) > 0,
                    "last_activity": int(parts[2]),
                })
        return sessions
    except FileNotFoundError:
        return []  # tmux not installed


async def check_tmux_session_exists_local(session_name: str) -> bool:
    """Check if a tmux session with the given name exists locally."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "tmux", "has-session", "-t", session_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return proc.returncode == 0
    except FileNotFoundError:
        return False  # tmux not installed


async def create_local_terminal_in_tmux(
    session_name: str | None = None,
    working_dir: str | None = None,
    cols: int = 120,
    rows: int = 40,
) -> tuple:
    """Create or attach to a local tmux session with a PTY.

    If session_name is provided, attaches to that existing session.
    Otherwise, creates a new session with a generated name.

    Args:
        session_name: Existing tmux session to attach to.
        working_dir: Starting directory for new sessions.
        cols: Terminal width in columns.
        rows: Terminal height in rows.

    Returns:
        Tuple of (LocalTerminalProcess, tmux session name).
    """
    from app.local.terminal import LocalTerminalProcess

    if session_name:
        name = session_name
        command = f"tmux attach -t '{name}'"
    else:
        name = await _generate_local_session_name(working_dir)
        cd_flag = f" -c '{working_dir}'" if working_dir else ""
        command = f"tmux new-session -s '{name}'{cd_flag}"

    process = await LocalTerminalProcess.spawn(command, cols, rows)
    return process, name


async def kill_tmux_session_local(session_name: str) -> bool:
    """Kill a local tmux session by name.

    Returns True if killed, False if not found.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "tmux", "kill-session", "-t", session_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return proc.returncode == 0
    except FileNotFoundError:
        return False  # tmux not installed
