"""Local machine connection manager with Docker/native auto-detection."""

from __future__ import annotations

import asyncio
import logging
import os

from app.config import settings

logger = logging.getLogger(__name__)

# Well-known ID for the local machine (never stored in DB)
LOCAL_MACHINE_ID = "local"
LOCAL_MACHINE_NAME = "This Machine"


def is_running_in_docker() -> bool:
    """Detect if we're running inside a Docker container.

    Checks for /.dockerenv file (always created by Docker) or the
    LOCUS_IN_DOCKER environment variable.
    """
    return os.path.exists("/.dockerenv") or settings.in_docker


class LocalMachineManager:
    """Manages the local machine connection.

    When running in Docker: uses SSH to host.docker.internal
    When running natively: uses asyncio subprocess directly

    Provides a similar interface to SSHManager for consistency,
    but the local machine is always considered "online".
    """

    def __init__(self) -> None:
        self._in_docker = is_running_in_docker()
        self._ssh_conn = None  # AsyncSSH connection (Docker mode only)
        self._status = "online"  # Always online

    @property
    def in_docker(self) -> bool:
        """Whether the backend is running inside a Docker container."""
        return self._in_docker

    async def initialize(self) -> None:
        """Set up the local machine connection on startup.

        In Docker mode: establishes SSH connection to host.docker.internal.
        In native mode: no-op (subprocess is used directly).
        """
        if self._in_docker:
            await self._connect_to_host()
        else:
            logger.info("Local machine: running in native mode (subprocess)")

    async def get_connection(self):
        """Get connection object for the local machine.

        Returns:
            AsyncSSH connection in Docker mode, or None in native mode.
            None is the sentinel that tells callers to use the subprocess path.
        """
        if self._in_docker:
            return self._ssh_conn
        return None  # Sentinel: use subprocess path

    async def run_command(self, command: str) -> str:
        """Run a command on the local machine and return stdout.

        In Docker mode: executes via SSH connection.
        In native mode: executes via asyncio subprocess.
        """
        if self._in_docker and self._ssh_conn:
            result = await self._ssh_conn.run(command, check=True)
            return result.stdout
        else:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return stdout.decode()

    def get_status(self) -> str:
        """Get local machine status. Always 'online'."""
        return "online"

    async def _connect_to_host(self) -> None:
        """SSH to the Docker host via host.docker.internal."""
        import asyncssh

        host = settings.local_ssh_host
        port = settings.local_ssh_port
        username = settings.local_ssh_user
        key_path = settings.local_ssh_key

        if not username or not key_path:
            logger.warning(
                "Local machine SSH not configured. Set LOCUS_LOCAL_SSH_USER "
                "and LOCUS_LOCAL_SSH_KEY for Docker-to-host access."
            )
            return

        try:
            self._ssh_conn = await asyncssh.connect(
                host,
                port=port,
                username=username,
                client_keys=[key_path],
                known_hosts=None,
                keepalive_interval=15,
                keepalive_count_max=3,
            )
            logger.info(
                "Local machine: connected to host via SSH (%s@%s:%d)",
                username,
                host,
                port,
            )
        except Exception as exc:
            logger.warning("Local machine: SSH to host failed: %s", exc)
            self._ssh_conn = None

    async def shutdown(self) -> None:
        """Close SSH connection if open. Called from FastAPI lifespan."""
        if self._ssh_conn:
            self._ssh_conn.close()
            try:
                await self._ssh_conn.wait_closed()
            except Exception:
                pass
            self._ssh_conn = None
            logger.info("Local machine: SSH connection closed")


local_machine_manager = LocalMachineManager()
