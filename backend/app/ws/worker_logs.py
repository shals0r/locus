"""WebSocket endpoint for real-time worker log streaming.

Clients connect to /ws/workers/{worker_id}/logs?token=... and receive:
1. Initial buffer of recent log lines
2. Live log lines as the worker produces them
3. Keepalive pings every 30s
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.auth import verify_token

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/workers/{worker_id}/logs")
async def worker_log_websocket(
    websocket: WebSocket,
    worker_id: str,
) -> None:
    """Stream worker logs via WebSocket.

    Auth via ?token= query parameter (same pattern as feed/terminal WS).
    Subscribes to the supervisor's log stream for the given worker.
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

    # Import supervisor here to avoid circular imports
    from app.api.workers import get_supervisor

    supervisor = get_supervisor()
    wp = supervisor.get_worker(worker_id)

    # Send initial log buffer
    initial_lines = wp.log_buffer if wp else []
    try:
        await websocket.send_text(json.dumps({
            "type": "initial",
            "lines": list(initial_lines),
        }))
    except Exception:
        return

    # Subscribe to live log stream
    log_queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    supervisor.subscribe_logs(worker_id, log_queue)

    try:
        while True:
            try:
                line = await asyncio.wait_for(log_queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps({
                    "type": "log",
                    "line": line,
                }))
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Worker log WebSocket error for %s: %s", worker_id, exc)
    finally:
        supervisor.unsubscribe_logs(worker_id, log_queue)
