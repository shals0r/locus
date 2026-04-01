"""Windows ConPTY session manager for the Locus Agent.

Creates terminal sessions backed by pywinpty (ConPTY API).
No tmux on Windows -- agent maintains its own 64KB ring buffer
scrollback per session.

IMPORTANT: This module is only importable on Windows.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

assert sys.platform == "win32", (
    "WindowsSessionManager is only available on Windows. "
    "Use UnixSessionManager on Unix platforms."
)

logger = logging.getLogger(__name__)


class WindowsSessionManager:
    """Manages terminal sessions on Windows via pywinpty (ConPTY).

    Each session spawns a ConPTY process. Since there is no tmux on
    Windows, the agent maintains a 64KB ring buffer scrollback per
    session for replay on reconnect.
    """

    MAX_SCROLLBACK = 65536  # 64KB ring buffer per session

    def __init__(self) -> None:
        self._scrollback: dict[str, bytearray] = {}

    async def create_session(
        self,
        session_id: str,
        cols: int,
        rows: int,
        working_dir: str | None = None,
        **kwargs,
    ) -> dict:
        """Create a new terminal session via ConPTY.

        Args:
            session_id: Unique session identifier.
            cols: Terminal width in columns.
            rows: Terminal height in rows.
            working_dir: Starting directory for the session.

        Returns:
            Dict with process handle and tmux_name=None.
        """
        try:
            from winpty import PtyProcess
        except ImportError:
            raise ImportError(
                "pywinpty is required for Windows terminal sessions. "
                "Run: pip install pywinpty"
            )

        shell = os.environ.get("COMSPEC", "powershell.exe")
        proc = PtyProcess.spawn(shell, dimensions=(rows, cols), cwd=working_dir)

        self._scrollback[session_id] = bytearray()

        logger.info(
            "TERMINAL: Created Windows session id=%s shell=%s",
            session_id, shell,
        )

        return {"process": proc, "tmux_name": None}

    async def read(self, session_data: dict, n: int = 16384) -> bytes:
        """Read from ConPTY process.

        Appends output to scrollback ring buffer, trimming to MAX_SCROLLBACK.
        """
        proc = session_data["process"]
        loop = asyncio.get_event_loop()

        # Run blocking read in executor
        try:
            data = await loop.run_in_executor(None, proc.read, n)
        except EOFError:
            return b""

        if isinstance(data, str):
            data = data.encode("utf-8", errors="replace")

        return data

    def _buffer_scrollback(self, session_id: str, data: bytes) -> None:
        """Append data to scrollback, trimming to MAX_SCROLLBACK."""
        buf = self._scrollback.get(session_id)
        if buf is not None:
            buf.extend(data)
            if len(buf) > self.MAX_SCROLLBACK:
                self._scrollback[session_id] = buf[-self.MAX_SCROLLBACK:]

    def write(self, session_data: dict, data: bytes) -> None:
        """Write data to the ConPTY process."""
        proc = session_data["process"]
        try:
            if isinstance(data, bytes):
                proc.write(data.decode("utf-8", errors="replace"))
            else:
                proc.write(data)
        except Exception as exc:
            logger.warning("Terminal write failed: %s", exc)

    def resize(self, session_data: dict, cols: int, rows: int) -> None:
        """Resize the ConPTY terminal."""
        proc = session_data["process"]
        try:
            proc.setwinsize(rows, cols)
        except Exception as exc:
            logger.warning("Terminal resize failed: %s", exc)

    def close(self, session_data: dict) -> None:
        """Kill the ConPTY process."""
        proc = session_data["process"]
        try:
            if proc.isalive():
                proc.terminate()
        except Exception as exc:
            logger.warning("Terminal close failed: %s", exc)

    def get_scrollback(self, session_id: str) -> bytes:
        """Return buffered scrollback for replay on reconnect."""
        return bytes(self._scrollback.get(session_id, b""))
