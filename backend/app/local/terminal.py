"""Local PTY terminal process for native mode (non-Docker).

Provides the same interface as AsyncSSH processes so that
SessionProcess in ws/terminal.py can use it interchangeably.

Duck-typing contract:
    - process.stdout.read(n) -> bytes
    - process.stdin.write(data)
    - process.channel.set_terminal_size(cols, rows)
    - process.close()
    - process.wait_closed()

IMPORTANT: This module uses pty/fcntl/termios which are Unix-only.
On Windows, the backend runs in Docker (Linux container) and uses
the SSH-to-host path instead.
"""

from __future__ import annotations

import asyncio
import os
import sys

if sys.platform == "win32":
    raise ImportError(
        "LocalTerminalProcess is not available on Windows. "
        "On Windows, the backend must run inside Docker (Linux container) "
        "and use SSH to connect to the host machine."
    )

import fcntl
import pty
import struct
import termios


class LocalTerminalProcess:
    """A local terminal process backed by a PTY.

    Provides the same read/write/resize interface as AsyncSSH processes
    so SessionProcess can use it interchangeably.

    The .channel property returns self, and set_terminal_size is implemented
    directly on this class, so process.channel.set_terminal_size(cols, rows)
    works correctly for the SessionProcess.resize() call.
    """

    def __init__(self, master_fd: int, pid: int, cols: int, rows: int) -> None:
        self._master_fd = master_fd
        self._pid = pid
        self._closed = False

        # Make master fd non-blocking for asyncio
        flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
        fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

        self._set_size(cols, rows)

    def _set_size(self, cols: int, rows: int) -> None:
        """Set terminal size via ioctl."""
        if not self._closed:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            try:
                fcntl.ioctl(self._master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    # --- Duck-typing: stdout-like interface ---

    @property
    def stdout(self):
        """Return self as the stdout reader (for process.stdout.read(n))."""
        return self

    # --- Duck-typing: stdin-like interface ---

    @property
    def stdin(self):
        """Return self as the stdin writer (for process.stdin.write(data))."""
        return self

    # --- Duck-typing: channel-like interface ---

    @property
    def channel(self):
        """Return self as the channel (for process.channel.set_terminal_size)."""
        return self

    def set_terminal_size(self, cols: int, rows: int) -> None:
        """Set terminal size (called via process.channel.set_terminal_size)."""
        self._set_size(cols, rows)

    # --- Core I/O ---

    async def read(self, n: int = 16384) -> bytes:
        """Read from PTY master fd asynchronously."""
        loop = asyncio.get_event_loop()
        future = loop.create_future()

        def _readable():
            try:
                data = os.read(self._master_fd, n)
                if not future.done():
                    future.set_result(data)
            except OSError:
                if not future.done():
                    future.set_result(b"")
            finally:
                try:
                    loop.remove_reader(self._master_fd)
                except Exception:
                    pass

        loop.add_reader(self._master_fd, _readable)
        return await future

    def write(self, data: bytes) -> None:
        """Write to PTY master fd (stdin)."""
        if not self._closed:
            try:
                os.write(self._master_fd, data)
            except OSError:
                pass

    # --- Lifecycle ---

    def close(self) -> None:
        """Close the PTY master fd."""
        if not self._closed:
            self._closed = True
            try:
                loop = asyncio.get_event_loop()
                loop.remove_reader(self._master_fd)
            except Exception:
                pass
            try:
                os.close(self._master_fd)
            except OSError:
                pass

    async def wait_closed(self) -> None:
        """Wait for the child process to exit (non-blocking)."""
        try:
            os.waitpid(self._pid, os.WNOHANG)
        except ChildProcessError:
            pass

    # --- Factory ---

    @classmethod
    async def spawn(cls, command: str, cols: int = 120, rows: int = 40) -> "LocalTerminalProcess":
        """Spawn a new PTY-backed process running the given command.

        Uses pty.openpty() + os.fork() to create a PTY pair and
        execute the command in the child process.

        Args:
            command: Shell command to execute (e.g., tmux new-session ...).
            cols: Terminal width in columns.
            rows: Terminal height in rows.

        Returns:
            A LocalTerminalProcess instance connected to the PTY master.
        """
        master_fd, slave_fd = pty.openpty()
        child_pid = os.fork()

        if child_pid == 0:
            # Child process
            os.setsid()
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            os.close(master_fd)
            os.close(slave_fd)
            os.environ["TERM"] = "xterm-256color"
            os.execvp("bash", ["bash", "-c", command])
        else:
            # Parent process
            os.close(slave_fd)
            return cls(master_fd, child_pid, cols, rows)
