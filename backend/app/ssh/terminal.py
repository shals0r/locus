"""PTY process creation for non-tmux terminal sessions."""

from __future__ import annotations

import asyncssh


async def create_terminal_process(
    conn: asyncssh.SSHClientConnection,
    cols: int = 120,
    rows: int = 40,
    command: str | None = None,
) -> asyncssh.SSHClientProcess:  # type: ignore[type-arg]
    """Create a raw PTY process on a remote machine (non-tmux fallback).

    Args:
        conn: An active SSH connection.
        cols: Terminal width in columns.
        rows: Terminal height in rows.
        command: Optional command to run. If None, starts a login shell.

    Returns:
        An SSH process with PTY allocation.
    """
    return await conn.create_process(
        command=command,
        term_type="xterm-256color",
        term_size=(cols, rows),
        encoding=None,  # raw bytes for binary transparency
    )
