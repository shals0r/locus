"""SSH connection pool with heartbeat monitoring and automatic reconnection."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

import asyncssh

from app.config import settings

logger = logging.getLogger(__name__)


class SSHManager:
    """Manages persistent SSH connections with heartbeat and reconnection.

    Provides a connection pool keyed by machine_id, with periodic heartbeat
    checks and exponential backoff reconnection on failure.
    """

    def __init__(self) -> None:
        self._connections: dict[str, asyncssh.SSHClientConnection] = {}
        self._heartbeat_tasks: dict[str, asyncio.Task] = {}  # type: ignore[type-arg]
        self._status_callbacks: list[Callable[[str, str], None]] = []
        self._machine_status: dict[str, str] = {}
        # Store connection params for reconnection
        self._conn_params: dict[str, dict[str, str | int]] = {}

    async def connect(
        self,
        machine_id: str,
        host: str,
        port: int,
        username: str,
        ssh_key_path: str,
    ) -> asyncssh.SSHClientConnection:
        """Establish an SSH connection and start heartbeat monitoring.

        Args:
            machine_id: Unique identifier for the machine.
            host: SSH host address.
            port: SSH port number.
            username: SSH username.
            ssh_key_path: Path to the SSH private key.

        Returns:
            The established SSH connection.
        """
        # Close existing connection if any
        if machine_id in self._connections:
            await self.disconnect(machine_id)

        conn = await asyncssh.connect(
            host,
            port=port,
            username=username,
            client_keys=[ssh_key_path],
            known_hosts=None,
            keepalive_interval=15,
            keepalive_count_max=3,
        )

        self._connections[machine_id] = conn
        self._conn_params[machine_id] = {
            "host": host,
            "port": port,
            "username": username,
            "ssh_key_path": ssh_key_path,
        }
        self._set_status(machine_id, "online")

        # Start heartbeat monitoring
        self._heartbeat_tasks[machine_id] = asyncio.create_task(
            self._heartbeat_loop(machine_id, conn, host, port, username, ssh_key_path)
        )

        logger.info("SSH connected to %s@%s:%d (machine=%s)", username, host, port, machine_id)
        return conn

    async def get_connection(self, machine_id: str) -> asyncssh.SSHClientConnection | None:
        """Get an existing SSH connection by machine ID.

        Returns:
            The SSH connection, or None if not connected.
        """
        return self._connections.get(machine_id)

    async def disconnect(self, machine_id: str) -> None:
        """Disconnect from a machine, cancelling heartbeat and closing connection."""
        # Cancel heartbeat task
        task = self._heartbeat_tasks.pop(machine_id, None)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Close connection
        conn = self._connections.pop(machine_id, None)
        if conn is not None:
            conn.close()
            try:
                await conn.wait_closed()
            except Exception:
                pass

        self._conn_params.pop(machine_id, None)
        self._set_status(machine_id, "offline")
        logger.info("SSH disconnected from machine=%s", machine_id)

    async def _heartbeat_loop(
        self,
        machine_id: str,
        conn: asyncssh.SSHClientConnection,
        host: str,
        port: int,
        username: str,
        ssh_key_path: str,
    ) -> None:
        """Periodically check connection health via echo command.

        On failure, triggers reconnection with exponential backoff.
        """
        interval = settings.heartbeat_interval_seconds
        while True:
            await asyncio.sleep(interval)
            try:
                await asyncio.wait_for(
                    conn.run("echo ok", check=True),
                    timeout=10,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "Heartbeat failed for machine=%s: %s", machine_id, exc
                )
                self._set_status(machine_id, "reconnecting")
                await self._reconnect(machine_id, host, port, username, ssh_key_path)
                return  # reconnect starts a new heartbeat loop

    async def _reconnect(
        self,
        machine_id: str,
        host: str,
        port: int,
        username: str,
        ssh_key_path: str,
    ) -> None:
        """Attempt to reconnect with exponential backoff.

        Uses settings for initial delay, max delay, and max retries.
        On success, restores online status and notifies callbacks.
        On exhausted retries, sets offline status and notifies callbacks.
        """
        delay = settings.reconnect_initial_delay
        max_delay = settings.reconnect_max_delay
        max_retries = settings.reconnect_max_retries

        # Clean up old connection
        old_conn = self._connections.pop(machine_id, None)
        if old_conn is not None:
            old_conn.close()
        old_task = self._heartbeat_tasks.pop(machine_id, None)
        if old_task is not None:
            old_task.cancel()

        for attempt in range(1, max_retries + 1):
            logger.info(
                "Reconnect attempt %d/%d for machine=%s (delay=%.1fs)",
                attempt, max_retries, machine_id, delay,
            )
            try:
                await self.connect(machine_id, host, port, username, ssh_key_path)
                logger.info("Reconnected to machine=%s on attempt %d", machine_id, attempt)
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "Reconnect attempt %d failed for machine=%s: %s",
                    attempt, machine_id, exc,
                )
                if attempt < max_retries:
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, max_delay)

        # All retries exhausted
        self._set_status(machine_id, "offline")
        logger.error(
            "All %d reconnect attempts exhausted for machine=%s", max_retries, machine_id
        )

    def on_status_change(self, callback: Callable[[str, str], None]) -> None:
        """Register a callback for machine status changes.

        Args:
            callback: Function called with (machine_id, status) where status
                      is one of "online", "offline", "reconnecting".
        """
        self._status_callbacks.append(callback)

    def get_status(self, machine_id: str) -> str:
        """Get current connection status for a machine.

        Returns:
            One of "online", "offline", or "reconnecting".
        """
        return self._machine_status.get(machine_id, "offline")

    async def shutdown(self) -> None:
        """Disconnect all machines and cancel all tasks. Called from FastAPI lifespan."""
        machine_ids = list(self._connections.keys())
        for machine_id in machine_ids:
            await self.disconnect(machine_id)
        logger.info("SSH manager shut down, disconnected %d machines", len(machine_ids))

    def _set_status(self, machine_id: str, status: str) -> None:
        """Update machine status and notify callbacks."""
        old_status = self._machine_status.get(machine_id)
        self._machine_status[machine_id] = status
        if old_status != status:
            for callback in self._status_callbacks:
                try:
                    callback(machine_id, status)
                except Exception:
                    logger.exception("Status callback error for machine=%s", machine_id)


ssh_manager = SSHManager()
