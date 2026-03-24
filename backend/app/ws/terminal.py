"""WebSocket endpoint for terminal I/O streaming over SSH."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.database import async_session_factory
from app.models.session import TerminalSession
from app.ssh.manager import ssh_manager
from app.ssh.tmux import create_terminal_in_tmux

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for bidirectional terminal I/O.

    Bridges a browser WebSocket to an SSH PTY process, streaming raw bytes
    for terminal output and accepting both binary input and JSON control
    messages (e.g., terminal resize).

    Protocol:
        - Binary frames: raw terminal I/O (stdin/stdout)
        - Text frames: JSON control messages
            - {"type": "resize", "cols": N, "rows": N}

    Authentication:
        Token is passed via query parameter `token`. Close with code 4001
        if authentication fails.
    """
    # Authenticate via query parameter
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    # TODO: Validate JWT token once auth service is implemented
    # For now, accept any non-empty token during development

    await websocket.accept()

    # Look up terminal session from database
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        await websocket.close(code=4002, reason="Invalid session ID")
        return

    async with async_session_factory() as db:
        result = await db.execute(
            select(TerminalSession).where(TerminalSession.id == session_uuid)
        )
        terminal_session = result.scalar_one_or_none()

    if terminal_session is None:
        await websocket.close(code=4004, reason="Session not found")
        return

    machine_id = str(terminal_session.machine_id)

    # Get SSH connection
    conn = await ssh_manager.get_connection(machine_id)
    if conn is None:
        await websocket.close(code=4003, reason="Machine not connected")
        return

    # Parse initial size from query params
    try:
        cols = int(websocket.query_params.get("cols", "120"))
        rows = int(websocket.query_params.get("rows", "40"))
    except ValueError:
        cols, rows = 120, 40

    # Create terminal process -- always wrap in tmux per design guidance
    process = None
    try:
        process = await create_terminal_in_tmux(
            conn,
            session_name=terminal_session.tmux_session_name,
            working_dir=terminal_session.repo_path,
            cols=cols,
            rows=rows,
        )

        # Run bidirectional I/O
        await asyncio.gather(
            _read_from_ssh(websocket, process),
            _read_from_ws(websocket, process),
        )
    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected for session=%s", session_id)
    except Exception:
        logger.exception("Terminal error for session=%s", session_id)
    finally:
        # Always clean up the SSH process (Pitfall 4: AsyncSSH Process Cleanup)
        if process is not None:
            try:
                process.close()
                await process.wait_closed()
            except Exception:
                pass
        logger.debug("Terminal session cleaned up: session=%s", session_id)


async def _read_from_ssh(
    websocket: WebSocket,
    process: object,
) -> None:
    """Read from SSH process stdout and send to WebSocket as binary frames."""
    try:
        while True:
            data = await process.stdout.read(4096)  # type: ignore[union-attr]
            if not data:
                break
            await websocket.send_bytes(data)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("SSH read stream ended")


async def _read_from_ws(
    websocket: WebSocket,
    process: object,
) -> None:
    """Read from WebSocket and write to SSH process stdin.

    Binary frames are written directly as terminal input.
    Text frames are parsed as JSON control messages.
    """
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                # Binary frame: raw terminal input
                process.stdin.write(message["bytes"])  # type: ignore[union-attr]
            elif "text" in message and message["text"] is not None:
                # Text frame: JSON control message
                try:
                    msg = json.loads(message["text"])
                    if msg.get("type") == "resize":
                        new_cols = int(msg.get("cols", 120))
                        new_rows = int(msg.get("rows", 40))
                        process.channel.set_terminal_size(  # type: ignore[union-attr]
                            new_cols, new_rows
                        )
                        logger.debug(
                            "Terminal resized to %dx%d", new_cols, new_rows
                        )
                except (json.JSONDecodeError, KeyError, TypeError) as exc:
                    logger.warning("Invalid control message: %s", exc)
    except WebSocketDisconnect:
        raise
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("WebSocket read stream ended")
