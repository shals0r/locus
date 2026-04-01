"""WebSocket endpoint for agent diagnostic log streaming.

Captures log records via a custom logging.Handler, buffers recent
entries, and broadcasts to connected WebSocket clients in real time.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from locus_agent.auth import verify_ws_token

logger = logging.getLogger(__name__)

router = APIRouter()

# Module-level log buffer and subscriber tracking
_log_buffer: list[str] = []
_max_buffer = 500
_subscribers: set[WebSocket] = set()


class AgentLogHandler(logging.Handler):
    """Custom logging handler that captures log records for streaming.

    Formats each record, appends to a bounded buffer, and broadcasts
    to all connected WebSocket subscribers.
    """

    def emit(self, record: logging.LogRecord) -> None:
        """Format and broadcast a log record."""
        try:
            message = self.format(record)
        except Exception:
            message = str(record)

        # Append to buffer, trim to max
        _log_buffer.append(message)
        if len(_log_buffer) > _max_buffer:
            del _log_buffer[: len(_log_buffer) - _max_buffer]

        # Broadcast to subscribers
        if _subscribers:
            payload = json.dumps({"type": "log", "line": message})
            for ws in list(_subscribers):
                try:
                    asyncio.create_task(_safe_send(ws, payload))
                except RuntimeError:
                    # No event loop running (e.g., during shutdown)
                    pass


async def _safe_send(ws: WebSocket, data: str) -> None:
    """Send data to a WebSocket, removing it from subscribers on failure."""
    try:
        await ws.send_text(data)
    except Exception:
        _subscribers.discard(ws)


@router.websocket("/ws/logs")
async def logs_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for streaming agent diagnostic logs.

    On connect, sends buffered log history. Then keeps the connection
    open for real-time log broadcasts via AgentLogHandler.
    """
    # Verify token before accepting
    token_valid = await verify_ws_token(websocket)
    if not token_valid:
        await websocket.close(code=4001, reason="Invalid authentication token")
        return

    await websocket.accept()

    # Send buffered log history
    try:
        await websocket.send_text(
            json.dumps({"type": "history", "lines": list(_log_buffer)})
        )
    except Exception as exc:
        logger.warning("Log history send failed: %s", exc)
        return

    # Register as subscriber
    _subscribers.add(websocket)

    try:
        # Keep alive: receive messages (ignored) to detect disconnect
        while True:
            await websocket.receive()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _subscribers.discard(websocket)


def install_log_handler() -> None:
    """Install the AgentLogHandler on the root logger.

    Called during app startup to begin capturing logs for streaming.
    """
    handler = AgentLogHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    logging.getLogger().addHandler(handler)
    logger.info("Agent log handler installed for WebSocket streaming")
