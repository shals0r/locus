"""Tmux session detection and creation on remote machines."""

from __future__ import annotations

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
        command = f"tmux attach -t {name}"
    else:
        name = f"locus-{uuid4().hex[:8]}"
        cd_flag = f" -c {working_dir}" if working_dir else ""
        command = f"tmux new-session -s {name}{cd_flag}"

    process = await conn.create_process(
        command,
        term_type="xterm-256color",
        term_size=(cols, rows),
        encoding=None,  # raw bytes mode
    )
    return process, name
