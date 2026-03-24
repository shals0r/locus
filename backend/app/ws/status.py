"""WebSocket endpoint for live status updates (machines, Claude sessions, services)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.auth import verify_token
from app.services.claude import detect_claude_sessions, detect_waiting_for_input
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# Polling interval for status updates (seconds)
STATUS_POLL_INTERVAL = 30


@router.websocket("/ws/status")
async def status_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for live machine and Claude Code status.

    Auth via ?token= query parameter. Sends initial snapshot on connect,
    then periodic delta updates every 30 seconds. Also receives immediate
    push updates when machine status changes.
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


async def _build_initial_snapshot() -> dict[str, Any]:
    """Build the initial status snapshot sent on WebSocket connect."""
    machine_statuses: dict[str, str] = {}
    claude_sessions: list[dict] = []

    for machine_id, conn in ssh_manager._connections.items():
        machine_statuses[machine_id] = ssh_manager.get_status(machine_id)
        try:
            sessions = await detect_claude_sessions(conn)
            for s in sessions:
                waiting = await detect_waiting_for_input(
                    conn, s["tmux_session"], s["window_index"]
                )
                s["machine_id"] = machine_id
                s["status"] = "waiting" if waiting else "running"
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
    """Periodically poll machine and Claude Code status, pushing deltas."""
    prev_claude_sessions: list[dict] = []

    while True:
        await asyncio.sleep(STATUS_POLL_INTERVAL)

        try:
            # Poll machine statuses
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

            # Poll Claude Code sessions
            all_claude: list[dict] = []
            for machine_id, conn in ssh_manager._connections.items():
                try:
                    sessions = await detect_claude_sessions(conn)
                    for s in sessions:
                        waiting = await detect_waiting_for_input(
                            conn, s["tmux_session"], s["window_index"]
                        )
                        s["machine_id"] = machine_id
                        s["status"] = "waiting" if waiting else "running"
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

        except WebSocketDisconnect:
            break
        except Exception as exc:
            logger.warning("Status poll error: %s", exc)
