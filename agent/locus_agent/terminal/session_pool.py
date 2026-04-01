"""Cross-platform terminal session pool.

Dispatches to UnixSessionManager or WindowsSessionManager based on
the current platform. Manages session lifecycle, WebSocket attachment,
background read loops, and scrollback buffering.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

if sys.platform == "win32":
    from .windows import WindowsSessionManager as PlatformManager
else:
    from .unix import UnixSessionManager as PlatformManager

logger = logging.getLogger(__name__)


class SessionPool:
    """Cross-platform session pool managing terminal sessions.

    On Unix, sessions are backed by tmux (scrollback handled by tmux).
    On Windows, sessions use ConPTY with agent-managed ring buffer scrollback.
    """

    MAX_SCROLLBACK = 65536  # 64KB ring buffer (Windows only; Unix uses tmux)

    def __init__(self) -> None:
        self._manager = PlatformManager()
        self._sessions: dict[str, dict] = {}  # session_id -> session_data
        self._ws_map: dict[str, WebSocket | None] = {}  # session_id -> attached ws
        self._scrollback: dict[str, bytearray] = {}  # Windows only
        self._read_tasks: dict[str, asyncio.Task] = {}  # background read loops

    async def create(
        self,
        session_id: str,
        cols: int,
        rows: int,
        working_dir: str | None = None,
        tmux_session: str | None = None,
    ) -> dict:
        """Create a new terminal session.

        Args:
            session_id: Unique session identifier.
            cols: Terminal width in columns.
            rows: Terminal height in rows.
            working_dir: Starting directory.
            tmux_session: Existing tmux session to attach to (Unix only).

        Returns:
            Session info dict including tmux_name.
        """
        session_data = await self._manager.create_session(
            session_id, cols, rows,
            working_dir=working_dir,
            tmux_session=tmux_session,
        )

        self._sessions[session_id] = session_data
        self._ws_map[session_id] = None

        # Initialize scrollback buffer (used on Windows; stays empty on Unix)
        if sys.platform == "win32":
            self._scrollback[session_id] = bytearray()

        # Start background read loop
        task = asyncio.create_task(self._read_loop(session_id))
        self._read_tasks[session_id] = task

        logger.info(
            "SESSION_POOL: Created session=%s tmux=%s",
            session_id, session_data.get("tmux_name"),
        )

        return session_data

    async def _read_loop(self, session_id: str) -> None:
        """Background loop reading from terminal and forwarding to WebSocket.

        On Windows, buffers output in scrollback ring buffer.
        On Unix, skips buffering (tmux handles scrollback natively).
        """
        session_data = self._sessions.get(session_id)
        if session_data is None:
            return

        try:
            while session_id in self._sessions:
                try:
                    data = await self._manager.read(session_data)
                except Exception as exc:
                    logger.warning(
                        "SESSION_POOL: Read error session=%s: %s",
                        session_id, exc,
                    )
                    break

                if not data:
                    break

                # Buffer scrollback on Windows only
                if sys.platform == "win32":
                    buf = self._scrollback.get(session_id)
                    if buf is not None:
                        buf.extend(data)
                        if len(buf) > self.MAX_SCROLLBACK:
                            self._scrollback[session_id] = buf[-self.MAX_SCROLLBACK:]
                    # Also buffer in the platform manager
                    self._manager._buffer_scrollback(session_id, data)

                # Forward to attached WebSocket if any
                ws = self._ws_map.get(session_id)
                if ws is not None:
                    try:
                        await ws.send_bytes(data)
                    except Exception as exc:
                        logger.warning(
                            "SESSION_POOL: WS send failed session=%s: %s",
                            session_id, exc,
                        )
                        self._ws_map[session_id] = None
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning(
                "SESSION_POOL: Read loop error session=%s: %s",
                session_id, exc,
            )

    def attach(self, session_id: str, ws: WebSocket) -> None:
        """Attach a WebSocket to receive terminal output."""
        self._ws_map[session_id] = ws

    def detach(self, session_id: str) -> None:
        """Detach the current WebSocket (process stays alive)."""
        self._ws_map[session_id] = None

    def get_scrollback(self, session_id: str) -> bytes:
        """Return buffered scrollback for replay on reconnect.

        On Windows, returns from the agent-managed ring buffer.
        On Unix, returns empty (tmux handles scrollback).
        """
        if sys.platform == "win32":
            buf = self._scrollback.get(session_id)
            if buf is not None:
                return bytes(buf)
            return self._manager.get_scrollback(session_id)
        return b""

    def write(self, session_id: str, data: bytes) -> None:
        """Write data to the terminal session."""
        session_data = self._sessions.get(session_id)
        if session_data is not None:
            self._manager.write(session_data, data)

    def resize(self, session_id: str, cols: int, rows: int) -> None:
        """Resize the terminal session."""
        session_data = self._sessions.get(session_id)
        if session_data is not None:
            self._manager.resize(session_data, cols, rows)

    async def close(self, session_id: str) -> None:
        """Close a terminal session and clean up resources."""
        # Cancel read task
        task = self._read_tasks.pop(session_id, None)
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        # Close via platform manager
        session_data = self._sessions.pop(session_id, None)
        if session_data is not None:
            self._manager.close(session_data)

        # Clean up maps
        self._ws_map.pop(session_id, None)
        self._scrollback.pop(session_id, None)

        logger.info("SESSION_POOL: Closed session=%s", session_id)

    async def close_all(self) -> None:
        """Close all sessions (for agent shutdown)."""
        session_ids = list(self._sessions.keys())
        for session_id in session_ids:
            await self.close(session_id)
        logger.info("SESSION_POOL: Closed all sessions (%d)", len(session_ids))

    def list_active(self) -> list[str]:
        """Return list of active session IDs."""
        return list(self._sessions.keys())


# Module-level singleton
session_pool = SessionPool()
