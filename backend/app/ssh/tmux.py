"""Tmux session detection and creation on remote machines."""

from __future__ import annotations

import re
from uuid import uuid4

import asyncssh


async def list_tmux_sessions(
    conn: asyncssh.SSHClientConnection,
) -> list[dict[str, str | bool | int]]:
    """List tmux sessions on a remote machine.

    Args:
        conn: An active SSH connection.

    Returns:
        List of dicts with keys: name (str), attached (bool), last_activity (int).
        Returns empty list if no tmux server is running.
    """
    try:
        result = await conn.run(
            "tmux ls -F '#{session_name}:#{session_attached}:#{session_activity}'",
            check=True,
        )
        sessions: list[dict[str, str | bool | int]] = []
        for line in result.stdout.strip().split("\n"):
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
    except asyncssh.ProcessError:
        return []  # no tmux server running


async def check_tmux_session_exists(
    conn: asyncssh.SSHClientConnection,
    session_name: str,
) -> bool:
    """Check if a tmux session with the given name exists."""
    try:
        await conn.run(
            f"tmux has-session -t {session_name}",
            check=True,
        )
        return True
    except asyncssh.ProcessError:
        return False


def _sanitize_tmux_name(raw: str) -> str:
    """Sanitize a string for use as a tmux session name.

    Tmux disallows periods and colons in session names.
    """
    name = re.sub(r"[.:\s]+", "-", raw)
    name = re.sub(r"-+", "-", name)
    name = name.strip("-")
    return name[:50]


async def _detect_git_branch(
    conn: asyncssh.SSHClientConnection,
    working_dir: str,
) -> str | None:
    """Detect the current git branch in a directory on a remote machine."""
    try:
        result = await conn.run(
            f"git -C {working_dir} rev-parse --abbrev-ref HEAD 2>/dev/null",
            check=True,
        )
        branch = result.stdout.strip()
        return branch if branch and branch != "HEAD" else None
    except asyncssh.ProcessError:
        return None


async def _resolve_name_collision(
    conn: asyncssh.SSHClientConnection,
    base_name: str,
) -> str:
    """Append a short suffix if a tmux session with base_name already exists."""
    if not await check_tmux_session_exists(conn, base_name):
        return base_name
    return f"{base_name}-{uuid4().hex[:4]}"


async def _generate_session_name(
    conn: asyncssh.SSHClientConnection,
    working_dir: str | None,
) -> str:
    """Generate a human-readable tmux session name from dir + git branch."""
    if not working_dir:
        return f"locus-{uuid4().hex[:8]}"

    dirname = working_dir.rstrip("/").split("/")[-1]
    branch = await _detect_git_branch(conn, working_dir)

    if branch:
        raw = f"{dirname}-{branch}"
    else:
        raw = dirname

    base = _sanitize_tmux_name(raw)
    if not base:
        return f"locus-{uuid4().hex[:8]}"

    return await _resolve_name_collision(conn, base)


async def kill_tmux_session(
    conn: asyncssh.SSHClientConnection,
    session_name: str,
) -> bool:
    """Kill a tmux session by name. Returns True if killed, False if not found."""
    try:
        await conn.run(f"tmux kill-session -t '{session_name}'", check=True)
        return True
    except asyncssh.ProcessError:
        return False


async def create_terminal_in_tmux(
    conn: asyncssh.SSHClientConnection,
    session_name: str | None = None,
    working_dir: str | None = None,
    cols: int = 120,
    rows: int = 40,
) -> tuple[asyncssh.SSHClientProcess, str]:  # type: ignore[type-arg]
    """Create or attach to a tmux session with a PTY.

    If session_name is provided, attaches to that existing session.
    Otherwise, creates a new session with a generated name.

    Args:
        conn: An active SSH connection.
        session_name: Existing tmux session to attach to.
        working_dir: Starting directory for new sessions.
        cols: Terminal width in columns.
        rows: Terminal height in rows.

    Returns:
        Tuple of (SSH process with PTY, tmux session name).
    """
    if session_name:
        name = session_name
        command = f"tmux attach -t '{name}'"
    else:
        name = await _generate_session_name(conn, working_dir)
        cd_flag = f" -c {working_dir}" if working_dir else ""
        command = f"tmux new-session -s '{name}'{cd_flag}"

    process = await conn.create_process(
        command,
        term_type="xterm-256color",
        term_size=(cols, rows),
        encoding=None,  # raw bytes mode
    )
    return process, name
