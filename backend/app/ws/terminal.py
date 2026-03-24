"""WebSocket endpoint for terminal I/O streaming over SSH.

Architecture: SSH terminal processes are long-lived and persist across
WebSocket reconnects. One process per session_id, reused when the browser
tab switches back or the page reloads. This prevents SSH channel exhaustion.
"""

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
from app.ssh.tmux import check_tmux_session_exists, create_terminal_in_tmux

logger = logging.getLogger(__name__)

router = APIRouter()


class SessionProcess:
    """A long-lived SSH terminal process for a single session.

    Survives WebSocket disconnects. Buffers recent output so a reconnecting
    client sees the current terminal state immediately.
    """

    def __init__(self, process: object, tmux_name: str) -> None:
        self.process = process
        self.tmux_name = tmux_name
        self._ws: WebSocket | None = None
        self._read_task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._alive = True
        # Ring buffer: last 64KB of output for instant replay on reconnect
        self._scrollback = bytearray()
        self._max_scrollback = 65536

    def start_reading(self) -> None:
        """Start background task that reads SSH stdout forever."""
        self._read_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        """Read from SSH process and forward to current WebSocket (if any)."""
        try:
            while self._alive:
                data = await self.process.stdout.read(16384)  # type: ignore[union-attr]
                if not data:
                    break
                # Buffer for replay
                self._scrollback.extend(data)
                if len(self._scrollback) > self._max_scrollback:
                    self._scrollback = self._scrollback[-self._max_scrollback:]
                # Forward to active WebSocket
                ws = self._ws
                if ws is not None:
                    try:
                        await ws.send_bytes(data)
                    except Exception:
                        self._ws = None
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        self._alive = False

    def attach(self, ws: WebSocket) -> None:
        """Attach a WebSocket to receive output."""
        self._ws = ws

    def detach(self) -> None:
        """Detach the current WebSocket."""
        self._ws = None

    def get_scrollback(self) -> bytes:
        """Return buffered output for replay on reconnect."""
        return bytes(self._scrollback)

    def write(self, data: bytes) -> None:
        """Write to SSH stdin."""
        if self._alive:
            try:
                self.process.stdin.write(data)  # type: ignore[union-attr]
            except Exception:
                pass

    def resize(self, cols: int, rows: int) -> None:
        """Resize the terminal."""
        if self._alive:
            try:
                self.process.channel.set_terminal_size(cols, rows)  # type: ignore[union-attr]
            except Exception:
                pass

    @property
    def alive(self) -> bool:
        return self._alive

    async def close(self) -> None:
        self._alive = False
        self._ws = None
        if self._read_task:
            self._read_task.cancel()
            try:
                await self._read_task
            except (asyncio.CancelledError, Exception):
                pass
        try:
            self.process.close()  # type: ignore[union-attr]
            await asyncio.wait_for(self.process.wait_closed(), timeout=2.0)  # type: ignore[union-attr]
        except Exception:
            pass


# Global pool: one process per session, survives WS reconnects
_pool: dict[str, SessionProcess] = {}
# Max concurrent SSH processes — leave headroom for heartbeat + other channels
_MAX_POOL = 4


async def _evict_pool() -> None:
    """Close dead processes and evict oldest idle ones if over limit."""
    # Remove dead entries
    dead = [sid for sid, sp in _pool.items() if not sp.alive]
    for sid in dead:
        sp = _pool.pop(sid)
        await sp.close()

    # Evict idle (no WS attached) processes if over limit, oldest first
    if len(_pool) >= _MAX_POOL:
        idle = [(sid, sp) for sid, sp in _pool.items() if sp._ws is None]
        for sid, sp in idle:
            if len(_pool) < _MAX_POOL:
                break
            _pool.pop(sid)
            await sp.close()
            logger.info("TERMINAL: Evicted idle process session=%s", sid)


async def close_session_process(session_id: str) -> None:
    """Close and remove a session's SSH process from the pool."""
    sp = _pool.pop(session_id, None)
    if sp is not None:
        await sp.close()
        logger.info("TERMINAL: Closed process session=%s", session_id)


async def _get_or_create_process(
    session_id: str,
    terminal_session: TerminalSession,
    conn: object,
    cols: int,
    rows: int,
) -> SessionProcess:
    """Get existing process or create a new one."""
    # Return existing if alive
    existing = _pool.get(session_id)
    if existing is not None and existing.alive:
        existing.resize(cols, rows)
        return existing

    # Clean up dead entry
    if existing is not None:
        await existing.close()
        _pool.pop(session_id, None)

    # Evict dead/idle processes before creating a new channel
    await _evict_pool()

    # Create new
    tmux_name_to_use = terminal_session.tmux_session_name
    if tmux_name_to_use:
        session_exists = await check_tmux_session_exists(conn, tmux_name_to_use)  # type: ignore[arg-type]
        if not session_exists:
            tmux_name_to_use = None

    process, tmux_name = await create_terminal_in_tmux(
        conn,  # type: ignore[arg-type]
        session_name=tmux_name_to_use,
        working_dir=terminal_session.repo_path,
        cols=cols,
        rows=rows,
    )

    sp = SessionProcess(process, tmux_name)
    sp.start_reading()
    _pool[session_id] = sp

    # Save tmux name if new
    if not terminal_session.tmux_session_name:
        try:
            from sqlalchemy import update as sa_update
            async with async_session_factory() as db:
                await db.execute(
                    sa_update(TerminalSession)
                    .where(TerminalSession.id == terminal_session.id)
                    .values(tmux_session_name=tmux_name)
                )
                await db.commit()
        except Exception:
            pass

    logger.info("TERMINAL: Created process session=%s tmux=%s", session_id, tmux_name)
    return sp


@router.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for bidirectional terminal I/O."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    await websocket.accept()

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
    conn = await ssh_manager.get_connection(machine_id)
    if conn is None:
        try:
            await websocket.send_text('{"type":"error","message":"Machine not connected."}')
        except Exception:
            pass
        await websocket.close(code=4003, reason="Machine not connected")
        return

    try:
        cols = int(websocket.query_params.get("cols", "120"))
        rows = int(websocket.query_params.get("rows", "40"))
    except ValueError:
        cols, rows = 120, 40

    sp = await _get_or_create_process(session_id, terminal_session, conn, cols, rows)

    # Attach this WebSocket as the active output target
    sp.attach(websocket)

    try:
        # Read from WebSocket → SSH stdin
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                sp.write(message["bytes"])
            elif "text" in message and message["text"] is not None:
                try:
                    msg = json.loads(message["text"])
                    if msg.get("type") == "resize":
                        sp.resize(int(msg.get("cols", 120)), int(msg.get("rows", 40)))
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        sp.detach()
        logger.info("TERMINAL: WS detached session=%s (process stays alive)", session_id)
