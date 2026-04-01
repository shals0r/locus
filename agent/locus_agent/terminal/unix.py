"""Unix PTY + tmux session manager for the Locus Agent.

Creates terminal sessions backed by tmux with full PTY support
(colors, mouse, resize). Sessions survive agent restarts because
tmux sessions persist independently.

IMPORTANT: This module uses pty/fcntl/termios which are Unix-only.
"""

from __future__ import annotations

import asyncio
import fcntl
import logging
import os
import pty
import struct
import sys
import termios

if sys.platform == "win32":
    raise ImportError(
        "UnixSessionManager is not available on Windows. "
        "Use WindowsSessionManager instead."
    )

logger = logging.getLogger(__name__)

TMUX_PREFIX = "locus-"


class UnixSessionManager:
    """Manages terminal sessions on Unix via tmux + PTY.

    Each session spawns a PTY that runs a tmux attach or new-session
    command. The tmux session persists independently, so if the agent
    restarts it can rediscover and reattach to existing sessions.

    No agent-side scrollback on Unix -- tmux handles it natively.
    """

    async def create_session(
        self,
        session_id: str,
        cols: int,
        rows: int,
        working_dir: str | None = None,
        tmux_session: str | None = None,
    ) -> dict:
        """Create a new terminal session backed by tmux.

        Args:
            session_id: Unique session identifier.
            cols: Terminal width in columns.
            rows: Terminal height in rows.
            working_dir: Starting directory for new sessions.
            tmux_session: Existing tmux session name to attach to.

        Returns:
            Dict with master_fd, pid, and tmux_name.
        """
        if tmux_session:
            name = tmux_session
            cmd = f"tmux attach -t '{tmux_session}'"
        else:
            name = f"{TMUX_PREFIX}{session_id[:8]}"
            cd_flag = f" -c '{working_dir}'" if working_dir else ""
            cmd = f"tmux new-session -s '{name}'{cd_flag}"

        master_fd, slave_fd = pty.openpty()
        child_pid = os.fork()

        if child_pid == 0:
            # Child process
            try:
                os.setsid()
                os.dup2(slave_fd, 0)
                os.dup2(slave_fd, 1)
                os.dup2(slave_fd, 2)
                os.close(master_fd)
                os.close(slave_fd)
                os.environ["TERM"] = "xterm-256color"
                os.execvp("bash", ["bash", "-c", cmd])
            except Exception:
                os._exit(1)
        else:
            # Parent process
            os.close(slave_fd)

            # Set terminal size
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            try:
                fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

            # Make master fd non-blocking for asyncio
            flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
            fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            logger.info(
                "TERMINAL: Created Unix session id=%s tmux=%s pid=%d",
                session_id, name, child_pid,
            )

            return {"master_fd": master_fd, "pid": child_pid, "tmux_name": name}

    async def read(self, session_data: dict, n: int = 16384) -> bytes:
        """Read from PTY master fd asynchronously.

        Uses event loop add_reader for non-blocking I/O.
        """
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        master_fd = session_data["master_fd"]

        def _readable():
            try:
                data = os.read(master_fd, n)
                if not future.done():
                    future.set_result(data)
            except OSError:
                if not future.done():
                    future.set_result(b"")
            finally:
                try:
                    loop.remove_reader(master_fd)
                except Exception:
                    pass

        loop.add_reader(master_fd, _readable)
        return await future

    def write(self, session_data: dict, data: bytes) -> None:
        """Write data to the PTY master fd."""
        try:
            os.write(session_data["master_fd"], data)
        except OSError as exc:
            logger.warning("Terminal write failed: %s", exc)

    def resize(self, session_data: dict, cols: int, rows: int) -> None:
        """Resize the terminal via ioctl TIOCSWINSZ."""
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        try:
            fcntl.ioctl(session_data["master_fd"], termios.TIOCSWINSZ, winsize)
        except OSError as exc:
            logger.warning("Terminal resize failed: %s", exc)

    def close(self, session_data: dict) -> None:
        """Close the PTY master fd and clean up the child process."""
        master_fd = session_data.get("master_fd")
        pid = session_data.get("pid")

        if master_fd is not None:
            try:
                loop = asyncio.get_event_loop()
                loop.remove_reader(master_fd)
            except Exception:
                pass
            try:
                os.close(master_fd)
            except OSError:
                pass

        if pid is not None:
            try:
                os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                pass

    async def list_sessions(self) -> list[dict]:
        """List tmux sessions with locus- prefix.

        Returns:
            List of dicts with name, attached, and last_activity keys.
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "tmux", "ls", "-F",
                "#{session_name}:#{session_attached}:#{session_activity}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            if proc.returncode != 0:
                return []

            sessions: list[dict] = []
            for line in stdout.decode().strip().split("\n"):
                if not line:
                    continue
                parts = line.split(":")
                if len(parts) >= 3 and parts[0].startswith(TMUX_PREFIX):
                    sessions.append({
                        "name": parts[0],
                        "attached": int(parts[1]) > 0,
                        "last_activity": int(parts[2]),
                    })
            return sessions
        except FileNotFoundError:
            return []  # tmux not installed

    async def rediscover(self) -> list[str]:
        """Rediscover existing locus- prefixed tmux sessions.

        Used for agent restart recovery (D-24). Returns list of
        tmux session names matching the locus-* prefix.
        """
        sessions = await self.list_sessions()
        return [s["name"] for s in sessions]
