"""Worker supervisor for managing integration worker subprocesses.

Handles subprocess lifecycle (start/stop/restart), exponential backoff
crash recovery, log streaming via subscriber queues, credential injection
via environment variables, and virtual environment management.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from app.database import async_session_factory

logger = logging.getLogger(__name__)

# -- Constants ----------------------------------------------------------------

MAX_FAILURES = 5
BACKOFF_BASE = 2
BACKOFF_MAX = 300
LOG_BUFFER_SIZE = 100

# Container-scoped HMAC secret for authenticating worker -> ingest API calls.
# Generated once per process lifetime.
_worker_secret: str = secrets.token_hex(32)


def get_worker_secret() -> str:
    """Return the container-scoped worker secret for ingest auth."""
    return _worker_secret


# -- State machine ------------------------------------------------------------


class WorkerState(str, Enum):
    """Possible states for a worker subprocess."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    DEGRADED = "degraded"
    CRASHED = "crashed"
    DISABLED = "disabled"
    STOPPING = "stopping"


# -- Worker process dataclass -------------------------------------------------


@dataclass
class WorkerProcess:
    """Runtime state for a single worker subprocess."""

    worker_id: str
    script_path: str = ""
    env: dict = field(default_factory=dict)
    venv_python: str | None = None
    process: Optional[asyncio.subprocess.Process] = None
    state: WorkerState = WorkerState.STOPPED
    failure_count: int = 0
    log_buffer: list[str] = field(default_factory=list)
    _monitor_task: Optional[asyncio.Task] = None
    _log_task: Optional[asyncio.Task] = None
    _subscribers: list[asyncio.Queue] = field(default_factory=list)


# -- Supervisor ---------------------------------------------------------------


class WorkerSupervisor:
    """Singleton supervisor managing all worker subprocesses.

    Uses asyncio.create_subprocess_exec() to spawn workers and monitors
    them for crashes with exponential backoff restart. Workers are disabled
    after MAX_FAILURES consecutive failures.
    """

    def __init__(self) -> None:
        self._workers: dict[str, WorkerProcess] = {}

    # -- Public lifecycle methods ---------------------------------------------

    async def start_worker(
        self,
        worker_id: str,
        script_path: str,
        env: dict,
        venv_python: str | None = None,
    ) -> None:
        """Spawn a worker subprocess and begin monitoring.

        Args:
            worker_id: Unique identifier (typically IntegrationSource.id as str).
            script_path: Absolute path to the worker Python script.
            env: Environment variables dict (includes credentials, config).
            venv_python: Optional path to a venv python binary. Falls back
                         to system python3 if None.
        """
        wp = self._workers.get(worker_id)
        if wp and wp.state in (WorkerState.RUNNING, WorkerState.STARTING):
            logger.warning("Worker %s already running, ignoring start", worker_id)
            return

        if not wp:
            wp = WorkerProcess(worker_id=worker_id)
            self._workers[worker_id] = wp

        wp.script_path = script_path
        wp.env = env
        wp.venv_python = venv_python
        wp.state = WorkerState.STARTING

        python_bin = venv_python or "python3"
        try:
            wp.process = await asyncio.create_subprocess_exec(
                python_bin,
                script_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, **env},
            )
            wp.state = WorkerState.RUNNING
            logger.info(
                "Worker %s started (PID %s, script=%s)",
                worker_id,
                wp.process.pid,
                script_path,
            )

            # Persist PID to database
            await self._update_worker_db(
                worker_id,
                worker_status="running",
                worker_pid=wp.process.pid,
                failure_count=0,
            )

            # Start log reader and monitor tasks
            wp._log_task = asyncio.create_task(self._read_logs(wp))
            wp._monitor_task = asyncio.create_task(
                self._monitor_worker(wp, script_path, env, venv_python)
            )

        except Exception as exc:
            wp.state = WorkerState.CRASHED
            logger.error("Failed to start worker %s: %s", worker_id, exc)
            await self._update_worker_db(
                worker_id, worker_status="crashed"
            )

    async def stop_worker(self, worker_id: str) -> None:
        """Gracefully stop a worker subprocess.

        Sends SIGTERM, waits up to 5 seconds, then SIGKILL as fallback.
        """
        wp = self._workers.get(worker_id)
        if not wp or not wp.process:
            logger.warning("Worker %s not running, nothing to stop", worker_id)
            return

        wp.state = WorkerState.STOPPING
        logger.info("Stopping worker %s (PID %s)", worker_id, wp.process.pid)

        # Cancel monitor task to prevent restart loop
        if wp._monitor_task and not wp._monitor_task.done():
            wp._monitor_task.cancel()
        if wp._log_task and not wp._log_task.done():
            wp._log_task.cancel()

        try:
            wp.process.terminate()
            try:
                await asyncio.wait_for(wp.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(
                    "Worker %s did not terminate in 5s, sending SIGKILL",
                    worker_id,
                )
                wp.process.kill()
                await wp.process.wait()
        except ProcessLookupError:
            pass  # Already dead

        wp.state = WorkerState.STOPPED
        wp.process = None
        logger.info("Worker %s stopped", worker_id)

        await self._update_worker_db(
            worker_id, worker_status="stopped", worker_pid=None
        )

    async def restart_worker(self, worker_id: str) -> None:
        """Restart a worker (stop then start with the same config)."""
        wp = self._workers.get(worker_id)
        if not wp:
            logger.warning("Worker %s not found, cannot restart", worker_id)
            return

        await self.stop_worker(worker_id)
        await self.start_worker(
            worker_id,
            script_path=wp.script_path,
            env=wp.env,
            venv_python=wp.venv_python,
        )

    async def shutdown(self) -> None:
        """Terminate all running workers. Called during FastAPI lifespan shutdown."""
        logger.info("Shutting down all workers (%d total)", len(self._workers))
        tasks = []
        for worker_id in list(self._workers):
            wp = self._workers[worker_id]
            if wp.process and wp.state in (
                WorkerState.RUNNING,
                WorkerState.STARTING,
                WorkerState.DEGRADED,
            ):
                tasks.append(self.stop_worker(worker_id))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        logger.info("All workers shut down")

    # -- Monitoring -----------------------------------------------------------

    async def _monitor_worker(
        self,
        wp: WorkerProcess,
        script_path: str,
        env: dict,
        venv_python: str | None,
    ) -> None:
        """Wait for process exit and implement exponential backoff restart.

        Disables the worker after MAX_FAILURES consecutive failures and
        posts a feed notification.
        """
        while True:
            try:
                if not wp.process:
                    return
                return_code = await wp.process.wait()
            except asyncio.CancelledError:
                return

            if wp.state == WorkerState.STOPPING:
                # Intentional stop, don't restart
                return

            wp.failure_count += 1
            logger.warning(
                "Worker %s exited with code %s (failure %d/%d)",
                wp.worker_id,
                return_code,
                wp.failure_count,
                MAX_FAILURES,
            )

            if wp.failure_count >= MAX_FAILURES:
                wp.state = WorkerState.DISABLED
                logger.error(
                    "Worker %s disabled after %d consecutive failures",
                    wp.worker_id,
                    MAX_FAILURES,
                )
                await self._update_worker_db(
                    wp.worker_id,
                    worker_status="disabled",
                    failure_count=wp.failure_count,
                )
                # Post feed notification about disabled worker
                await self._post_worker_disabled_notification(wp.worker_id)
                return

            wp.state = WorkerState.CRASHED
            await self._update_worker_db(
                wp.worker_id,
                worker_status="crashed",
                failure_count=wp.failure_count,
            )

            # Exponential backoff: 2^failure_count, capped at BACKOFF_MAX
            delay = min(BACKOFF_BASE ** wp.failure_count, BACKOFF_MAX)
            logger.info(
                "Restarting worker %s in %ds (attempt %d)",
                wp.worker_id,
                delay,
                wp.failure_count,
            )
            try:
                await asyncio.sleep(delay)
            except asyncio.CancelledError:
                return

            # Attempt restart
            wp.state = WorkerState.STARTING
            python_bin = venv_python or "python3"
            try:
                wp.process = await asyncio.create_subprocess_exec(
                    python_bin,
                    script_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    env={**os.environ, **env},
                )
                wp.state = WorkerState.RUNNING
                logger.info(
                    "Worker %s restarted (PID %s)",
                    wp.worker_id,
                    wp.process.pid,
                )
                await self._update_worker_db(
                    wp.worker_id,
                    worker_status="running",
                    worker_pid=wp.process.pid,
                )
                # Restart log reader
                if wp._log_task and not wp._log_task.done():
                    wp._log_task.cancel()
                wp._log_task = asyncio.create_task(self._read_logs(wp))

            except Exception as exc:
                wp.state = WorkerState.CRASHED
                logger.error(
                    "Failed to restart worker %s: %s", wp.worker_id, exc
                )

    # -- Log streaming --------------------------------------------------------

    async def _read_logs(self, wp: WorkerProcess) -> None:
        """Read stdout/stderr from the worker process and buffer lines.

        Lines are appended to a ring buffer (LOG_BUFFER_SIZE) and broadcast
        to any subscribed asyncio.Queue instances.
        """
        if not wp.process or not wp.process.stdout:
            return
        try:
            async for raw_line in wp.process.stdout:
                line = raw_line.decode("utf-8", errors="replace").rstrip()
                # Ring buffer
                wp.log_buffer.append(line)
                if len(wp.log_buffer) > LOG_BUFFER_SIZE:
                    wp.log_buffer.pop(0)

                # Broadcast to subscribers
                for queue in list(wp._subscribers):
                    try:
                        queue.put_nowait(line)
                    except asyncio.QueueFull:
                        pass  # Drop line if subscriber can't keep up
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.debug("Log reader for %s ended: %s", wp.worker_id, exc)

    def subscribe_logs(self, worker_id: str, queue: asyncio.Queue) -> None:
        """Subscribe to log output for a worker via an asyncio.Queue."""
        wp = self._workers.get(worker_id)
        if wp:
            wp._subscribers.append(queue)

    def unsubscribe_logs(self, worker_id: str, queue: asyncio.Queue) -> None:
        """Unsubscribe from log output for a worker."""
        wp = self._workers.get(worker_id)
        if wp and queue in wp._subscribers:
            wp._subscribers.remove(queue)

    # -- Worker queries -------------------------------------------------------

    def get_worker(self, worker_id: str) -> WorkerProcess | None:
        """Get a worker process by ID."""
        return self._workers.get(worker_id)

    def get_all_workers(self) -> dict[str, WorkerProcess]:
        """Get all tracked worker processes."""
        return dict(self._workers)

    # -- Environment setup ----------------------------------------------------

    async def build_worker_env(self, worker_id: str) -> dict:
        """Build the environment dict for a worker subprocess.

        Decrypts credentials from the database using decrypt_value(),
        adds the ingest URL and worker secret, and injects per-source
        config values as environment variables.

        Returns:
            Dict of environment variable name -> value.
        """
        from app.services.crypto import decrypt_value
        from app.models.integration_source import IntegrationSource
        from app.models.credential import Credential
        from sqlalchemy import select

        env: dict[str, str] = {
            "LOCUS_INGEST_URL": "http://localhost:8080/api/feed/ingest",
            "LOCUS_WORKER_SECRET": _worker_secret,
        }

        async with async_session_factory() as db:
            # Load integration source
            result = await db.execute(
                select(IntegrationSource).where(
                    IntegrationSource.id == worker_id
                )
            )
            source = result.scalar_one_or_none()
            if not source:
                logger.warning("Worker %s not found in DB", worker_id)
                return env

            env["POLL_INTERVAL"] = str(source.poll_interval_seconds)
            env["SOURCE_TYPE"] = source.source_type
            env["WORKER_ID"] = str(source.id)

            # Inject source config as env vars (uppercased keys)
            if source.config:
                for key, value in source.config.items():
                    env[key.upper()] = str(value)

            # Decrypt and inject credential if present
            if source.credential_id:
                cred_result = await db.execute(
                    select(Credential).where(
                        Credential.id == source.credential_id
                    )
                )
                cred = cred_result.scalar_one_or_none()
                if cred:
                    try:
                        decrypted = decrypt_value(cred.encrypted_data)
                        # Parse as JSON for structured credentials
                        try:
                            cred_data = json.loads(decrypted)
                            if isinstance(cred_data, dict):
                                for k, v in cred_data.items():
                                    env[k.upper()] = str(v)
                        except (json.JSONDecodeError, TypeError):
                            # Single value credential (e.g. API key)
                            env["API_KEY"] = decrypted
                    except Exception as exc:
                        logger.error(
                            "Failed to decrypt credentials for worker %s: %s",
                            worker_id,
                            exc,
                        )

        return env

    # -- Virtual environment management ---------------------------------------

    async def setup_venv(
        self, worker_id: str, requirements_path: str
    ) -> str:
        """Create a virtual environment and install dependencies.

        Creates venv at /data/workers/user/{worker_id}/.venv/ and installs
        packages from the given requirements file.

        Args:
            worker_id: Worker identifier for the venv directory.
            requirements_path: Path to a requirements.txt file.

        Returns:
            Path to the venv python binary.
        """
        venv_path = f"/data/workers/user/{worker_id}/.venv"
        python_path = os.path.join(venv_path, "bin", "python")

        # Create venv
        logger.info("Creating venv for worker %s at %s", worker_id, venv_path)
        proc = await asyncio.create_subprocess_exec(
            "python3", "-m", "venv", venv_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"Failed to create venv: {stdout.decode('utf-8', errors='replace')}"
            )

        # Install requirements
        pip_path = os.path.join(venv_path, "bin", "pip")
        logger.info("Installing requirements for worker %s", worker_id)
        proc = await asyncio.create_subprocess_exec(
            pip_path, "install", "-r", requirements_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"Failed to install requirements: {stdout.decode('utf-8', errors='replace')}"
            )

        logger.info("Venv ready for worker %s: %s", worker_id, python_path)
        return python_path

    # -- Internal helpers -----------------------------------------------------

    async def _update_worker_db(
        self, worker_id: str, **kwargs
    ) -> None:
        """Update worker fields in the database."""
        from sqlalchemy import update
        from app.models.integration_source import IntegrationSource

        try:
            async with async_session_factory() as db:
                await db.execute(
                    update(IntegrationSource)
                    .where(IntegrationSource.id == worker_id)
                    .values(**kwargs)
                )
                await db.commit()
        except Exception as exc:
            logger.warning(
                "Failed to update worker %s in DB: %s", worker_id, exc
            )

    async def _post_worker_disabled_notification(
        self, worker_id: str
    ) -> None:
        """Post a feed notification when a worker is disabled."""
        try:
            from app.services.feed_service import ingest_item

            async with async_session_factory() as db:
                await ingest_item(db, {
                    "source_type": "system",
                    "external_id": f"worker-disabled:{worker_id}",
                    "title": f"Worker {worker_id} disabled after {MAX_FAILURES} failures",
                    "snippet": "The integration worker has been disabled due to repeated failures. Check logs and restart manually.",
                    "tier_hint": "respond",
                    "source_icon": "warning",
                })
                await db.commit()
        except Exception as exc:
            logger.warning(
                "Failed to post disabled notification for %s: %s",
                worker_id,
                exc,
            )
