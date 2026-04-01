"""WebSocket endpoint for terminal I/O streaming.

Binary frames carry raw PTY I/O. Text frames carry JSON control
messages (e.g., resize). Sessions survive WebSocket disconnects --
the terminal process stays alive and scrollback is replayed on
reconnect.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from locus_agent.auth import verify_ws_token
from locus_agent.terminal.session_pool import session_pool

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for bidirectional terminal I/O.

    Protocol:
        - Binary frames: raw PTY input/output
        - Text frames: JSON control messages
            - {"type": "resize", "cols": N, "rows": N}
    """
    # Verify token before accepting
    token_valid = await verify_ws_token(websocket)
    if not token_valid:
        await websocket.close(code=4001, reason="Invalid authentication token")
        return

    await websocket.accept()

    # Check session exists
    if session_id not in session_pool._sessions:
        await websocket.close(code=4004, reason="Session not found")
        return

    # Attach WebSocket to session
    session_pool.attach(session_id, websocket)

    # Replay scrollback on reconnect
    scrollback = session_pool.get_scrollback(session_id)
    if scrollback:
        try:
            await websocket.send_bytes(scrollback)
        except Exception as exc:
            logger.warning("Terminal scrollback replay failed: %s", exc)

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # Binary frames: terminal input
            if "bytes" in message and message["bytes"] is not None:
                session_pool.write(session_id, message["bytes"])

            # Text frames: control messages
            elif "text" in message and message["text"] is not None:
                try:
                    msg = json.loads(message["text"])
                    if msg.get("type") == "resize":
                        cols = int(msg.get("cols", 120))
                        rows = int(msg.get("rows", 40))
                        session_pool.resize(session_id, cols, rows)
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Terminal WS read loop error: %s", exc)
    finally:
        # Detach only -- process stays alive for reconnect
        session_pool.detach(session_id)
        logger.info(
            "TERMINAL: WS detached session=%s (process stays alive)",
            session_id,
        )
