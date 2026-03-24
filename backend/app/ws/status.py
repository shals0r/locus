"""WebSocket endpoint for live status updates (machines, Claude sessions, services)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import asyncssh
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.database import async_session_factory
from app.models.session import TerminalSession
from app.services.auth import verify_token
from app.services.claude import detect_claude_sessions, detect_claude_session_status
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# Polling intervals (seconds)
CLAUDE_POLL_INTERVAL = 10
MACHINE_POLL_EVERY_N_TICKS = 3  # machine status every 3 Claude ticks (30s)


@router.websocket("/ws/status")
async def status_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for live machine and Claude Code status.

    Auth via ?token= query parameter. Sends initial snapshot on connect,
    then periodic delta updates. Claude sessions polled every 10s,
    machine statuses every 30s. Also receives immediate push updates
    when machine status changes.
    """
    # Auth check
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4003, reason="Invalid token")
        return

    await websocket.accept()

    # Track connected clients for push updates
    status_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def on_machine_status_change(machine_id: str, status: str) -> None:
        """Callback from ssh_manager when a machine status changes."""
        try:
            status_queue.put_nowait(
                {
                    "type": "machine_status",
                    "machine_id": machine_id,
                    "status": status,
                }
            )
        except asyncio.QueueFull:
            pass

    ssh_manager.on_status_change(on_machine_status_change)

    try:
        # Send initial snapshot
        initial = await _build_initial_snapshot()
        await websocket.send_text(json.dumps(initial))

        # Start polling task
        poll_task = asyncio.create_task(_poll_loop(websocket, status_queue))

        try:
            # Keep connection alive, process incoming messages (e.g., ping)
            while True:
                # Also drain push updates
                try:
                    msg = status_queue.get_nowait()
                    await websocket.send_text(json.dumps(msg))
                except asyncio.QueueEmpty:
                    pass

                # Wait for client message or timeout
                try:
                    await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
        except WebSocketDisconnect:
            pass
        finally:
            poll_task.cancel()
            try:
                await poll_task
            except asyncio.CancelledError:
                pass
    finally:
        # Remove callback
        try:
            ssh_manager._status_callbacks.remove(on_machine_status_change)
        except ValueError:
            pass


async def _detect_pane_display_name(
    conn: asyncssh.SSHClientConnection,
    tmux_session_name: str,
) -> str | None:
    """Get a display name for a tmux session based on pane CWD + git branch."""
    try:
        result = await conn.run(
            f"tmux display-message -p -t '{tmux_session_name}' '#{{pane_current_path}}'",
            check=True,
        )
        cwd = result.stdout.strip()
        if not cwd:
            return None

        dirname = cwd.rstrip("/").split("/")[-1]

        # Try git branch
        try:
            br_result = await conn.run(
                f"git -C '{cwd}' rev-parse --abbrev-ref HEAD 2>/dev/null",
                check=True,
            )
            branch = br_result.stdout.strip()
            if branch and branch != "HEAD":
                # Sanitize: replace dots/colons with dashes
                branch = re.sub(r"[.:\s]+", "-", branch)
                return f"{dirname}-{branch}"
        except asyncssh.ProcessError:
            pass

        return dirname
    except Exception:
        return None


async def _poll_session_names() -> list[dict[str, str]]:
    """Check CWD+branch for all active sessions, return updates."""
    updates: list[dict[str, str]] = []

    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(TerminalSession).where(TerminalSession.is_active.is_(True))
            )
            sessions = result.scalars().all()
    except Exception:
        return updates

    for session in sessions:
        tmux_name = session.tmux_session_name
        if not tmux_name:
            continue

        machine_id = str(session.machine_id)
        conn = ssh_manager._connections.get(machine_id)
        if conn is None:
            continue

        display_name = await _detect_pane_display_name(conn, tmux_name)
        if display_name:
            updates.append({
                "session_id": str(session.id),
                "display_name": display_name,
            })

    return updates


async def _detect_session_statuses(
    machine_id: str,
    conn: object,
) -> list[dict]:
    """Detect Claude sessions and their statuses on a machine."""
    sessions = await detect_claude_sessions(conn)  # type: ignore[arg-type]
    for s in sessions:
        s["machine_id"] = machine_id
        s["status"] = await detect_claude_session_status(
            conn, s["tmux_session"], s["window_index"]  # type: ignore[arg-type]
        )
    return sessions


async def _build_initial_snapshot() -> dict[str, Any]:
    """Build the initial status snapshot sent on WebSocket connect."""
    machine_statuses: dict[str, str] = {}
    claude_sessions: list[dict] = []

    for machine_id, conn in ssh_manager._connections.items():
        machine_statuses[machine_id] = ssh_manager.get_status(machine_id)
        try:
            sessions = await _detect_session_statuses(machine_id, conn)
            claude_sessions.extend(sessions)
        except Exception as exc:
            logger.warning(
                "Failed to detect Claude sessions for %s: %s", machine_id, exc
            )

    return {
        "type": "initial",
        "machines": machine_statuses,
        "claude_sessions": claude_sessions,
        "services": {
            "database": "connected",
            "claude_code": "configured"
            if claude_sessions
            else "unconfigured",
        },
    }


async def _poll_loop(
    websocket: WebSocket,
    status_queue: asyncio.Queue[dict[str, Any]],
) -> None:
    """Periodically poll status, pushing deltas.

    Claude sessions every 10s, machine statuses every 30s.
    """
    prev_claude_sessions: list[dict] = []
    prev_session_names: dict[str, str] = {}  # session_id -> display_name
    tick = 0

    while True:
        await asyncio.sleep(CLAUDE_POLL_INTERVAL)
        tick += 1

        try:
            # Machine status every Nth tick
            if tick % MACHINE_POLL_EVERY_N_TICKS == 0:
                for machine_id in list(ssh_manager._connections.keys()):
                    current_status = ssh_manager.get_status(machine_id)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "machine_status",
                                "machine_id": machine_id,
                                "status": current_status,
                            }
                        )
                    )

            # Claude sessions every tick
            all_claude: list[dict] = []
            for machine_id, conn in ssh_manager._connections.items():
                try:
                    sessions = await _detect_session_statuses(machine_id, conn)
                    all_claude.extend(sessions)
                except Exception:
                    pass

            # Send claude sessions update if changed
            if all_claude != prev_claude_sessions:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "claude_sessions",
                            "sessions": all_claude,
                        }
                    )
                )
                prev_claude_sessions = all_claude

            # Session display names every tick (CWD + branch detection)
            name_updates = await _poll_session_names()
            changed = [
                u for u in name_updates
                if prev_session_names.get(u["session_id"]) != u["display_name"]
            ]
            if changed:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "session_names",
                            "updates": changed,
                        }
                    )
                )
                for u in changed:
                    prev_session_names[u["session_id"]] = u["display_name"]

        except WebSocketDisconnect:
            break
        except Exception as exc:
            logger.warning("Status poll error: %s", exc)
