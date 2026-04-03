"""Local machine connection manager with Docker/native auto-detection.

Supports three modes (in priority order):
1. Host agent (LOCUS_AGENT_URL set and agent reachable)
2. SSH to host (Docker mode with SSH configured)
3. Subprocess (native mode, no Docker)
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil

from app.config import settings

# Shared volume mount point (host's ~/.locus-agent)
AGENT_SHARED_DIR = "/opt/locus-agent"
# Agent source in Docker image
AGENT_SRC_DIR = "/app/agent-src"

logger = logging.getLogger(__name__)

# Well-known ID for the local machine (never stored in DB)
LOCAL_MACHINE_ID = "local"
LOCAL_MACHINE_NAME = "This Machine"

_BOOTSTRAP_SCRIPT = """\
#!/usr/bin/env python3
\"\"\"Locus Agent bootstrap installer.

Run: python ~/.locus-agent/install.py
\"\"\"
import os, subprocess, sys, venv

HERE = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(HERE, "venv")
SRC = os.path.join(HERE, "locus-agent")

if sys.platform == "win32":
    python = os.path.join(VENV, "Scripts", "python.exe")
    pip = os.path.join(VENV, "Scripts", "pip.exe")
else:
    python = os.path.join(VENV, "bin", "python")
    pip = os.path.join(VENV, "bin", "pip")

if not os.path.exists(python):
    print("Creating venv...")
    venv.create(VENV, with_pip=True)
    print(f"Installing locus-agent from {SRC}...")
    subprocess.check_call([pip, "install", "--quiet", SRC])
else:
    print("Agent already installed.")

print("Starting locus-agent...")
subprocess.Popen(
    [python, "-m", "locus_agent", "start"],
    cwd=HERE,
    start_new_session=True,
    stdout=open(os.path.join(HERE, "agent.log"), "w"),
    stderr=subprocess.STDOUT,
)
print("Done! Agent is running on http://localhost:7700")
print("Refresh Locus in your browser — 'This Machine' should show as online.")
"""


def is_running_in_docker() -> bool:
    """Detect if we're running inside a Docker container.

    Checks for /.dockerenv file (always created by Docker) or the
    LOCUS_IN_DOCKER environment variable.
    """
    return os.path.exists("/.dockerenv") or settings.in_docker


class LocalMachineManager:
    """Manages the local machine connection.

    Priority:
      1. Host agent (if LOCUS_AGENT_URL configured and reachable)
      2. SSH to host.docker.internal (Docker mode)
      3. asyncio subprocess (native mode)

    Provides a similar interface to SSHManager for consistency.

    Status logic:
      - Agent connected: always "online"
      - Native mode (no agent): always "online" (subprocess talks to real host)
      - Docker + SSH connected: "online" (SSH reaches the host)
      - Docker + no SSH + no agent: "needs_setup" (container shell is NOT the host)
    """

    def __init__(self) -> None:
        self._in_docker = is_running_in_docker()
        self._ssh_conn = None  # AsyncSSH connection (Docker mode only)
        self._agent_client = None  # AgentClient when agent is available
        self._agent_available: bool = False

    @property
    def in_docker(self) -> bool:
        """Whether the backend is running inside a Docker container."""
        return self._in_docker

    @property
    def agent_client(self):
        """Return the AgentClient if agent is available, else None."""
        return self._agent_client if self._agent_available else None

    async def initialize(self) -> None:
        """Set up the local machine connection on startup.

        Tries agent first (if configured). If agent is not running and SSH
        is available, auto-deploys the agent (like VS Code Remote).
        Falls back to SSH-only, then subprocess (native mode).
        """
        # Try agent first if configured
        if settings.agent_url:
            await self._try_agent()

        # If agent is available, skip SSH
        if self._agent_available:
            return

        if self._in_docker:
            await self._connect_to_host()
            # Agent wasn't running but SSH is up — auto-deploy agent
            if self._ssh_conn is not None and not self._agent_available:
                await self._auto_deploy_agent()
            # No agent and no SSH — stage source to shared volume for manual install
            if not self._agent_available and self._ssh_conn is None:
                self._stage_agent_source()
        else:
            logger.info("Local machine: running in native mode (subprocess)")

    async def _try_agent(self) -> None:
        """Attempt to connect to the host agent."""
        from app.agent.client import AgentClient
        from app.agent.deployer import probe_agent

        token = self._read_agent_token()
        try:
            health = await probe_agent(settings.agent_url, token=token)
            if health is not None:
                self._agent_client = AgentClient(settings.agent_url, token or "")
                self._agent_available = True
                logger.info(
                    "Local machine: connected via host agent at %s (version=%s)",
                    settings.agent_url,
                    health.get("version"),
                )
            else:
                logger.warning(
                    "Host agent not reachable at %s -- falling back to SSH",
                    settings.agent_url,
                )
        except Exception as exc:
            logger.warning(
                "Host agent probe failed at %s: %s -- falling back to SSH",
                settings.agent_url,
                exc,
            )

    def _stage_agent_source(self) -> None:
        """Copy agent source to the shared volume so the user can install it.

        The shared volume (~/.locus-agent on host) is bind-mounted at
        /opt/locus-agent in the container. Writes agent source and a
        bootstrap script the user can run with one command.
        """
        if not os.path.isdir(AGENT_SRC_DIR):
            return
        dest = os.path.join(AGENT_SHARED_DIR, "locus-agent")
        try:
            if os.path.isdir(dest):
                shutil.rmtree(dest)
            shutil.copytree(AGENT_SRC_DIR, dest)

            # Write bootstrap install script
            bootstrap = os.path.join(AGENT_SHARED_DIR, "install.py")
            with open(bootstrap, "w") as f:
                f.write(_BOOTSTRAP_SCRIPT)

            logger.info(
                "Local machine: agent source staged to shared volume. "
                "Run 'python ~/.locus-agent/install.py' on the host to install."
            )
        except Exception as exc:
            logger.debug("Failed to stage agent source: %s", exc)

    async def _auto_deploy_agent(self) -> None:
        """Auto-deploy the host agent over SSH (VS Code Remote-style).

        Called when agent probe failed but SSH to host succeeded.
        Non-blocking: if deploy fails, SSH remains the fallback.
        """
        from app.agent.client import AgentClient
        from app.agent.deployer import ensure_agent

        try:
            host = settings.local_ssh_host
            base_url, token = await ensure_agent(self._ssh_conn, host=host)
            self._agent_client = AgentClient(base_url, token)
            self._agent_available = True
            logger.info(
                "Local machine: agent auto-deployed at %s",
                base_url,
            )
        except Exception as exc:
            logger.info(
                "Local machine: agent auto-deploy skipped (%s), using SSH",
                exc,
            )

    def _read_agent_token(self) -> str | None:
        """Read agent auth token from the configured token file."""
        if not settings.agent_token_file:
            return None
        try:
            with open(settings.agent_token_file) as f:
                token = f.read().strip()
            return token if token else None
        except (FileNotFoundError, PermissionError, OSError) as exc:
            logger.debug("Could not read agent token file %s: %s", settings.agent_token_file, exc)
            return None

    async def get_connection(self):
        """Get connection object for the local machine.

        Returns:
            AsyncSSH connection in Docker mode (or None if SSH not configured),
            or None in native mode as the sentinel for the subprocess path.

        IMPORTANT: In Docker mode, None means "not available" (needs_setup).
        In native mode, None means "use subprocess". Callers MUST check
        ``in_docker`` to distinguish these two cases.

        Note: When agent is available, callers should use agent_client property
        instead of this method. This method exists for SSH/subprocess fallback.
        """
        if self._in_docker:
            return self._ssh_conn
        return None  # Sentinel: use subprocess path (native mode only)

    @property
    def is_usable(self) -> bool:
        """Whether the local machine can actually execute commands on the host.

        True when agent is available (any mode).
        True in native mode (subprocess reaches host directly).
        True in Docker mode only when SSH to host is connected.
        False in Docker mode without SSH or agent -- subprocess would run in the
        container, which is NOT the user's host machine.
        """
        if self._agent_available:
            return True
        if not self._in_docker:
            return True
        return self._ssh_conn is not None

    async def run_command(self, command: str) -> str:
        """Run a command on the local machine and return stdout.

        Priority: agent > SSH (Docker) > subprocess (native).

        Raises ConnectionError if in Docker mode without SSH or agent (needs_setup).
        """
        # Prefer agent when available
        if self._agent_client and self._agent_available:
            return await self._agent_client.run_command(command)

        if self._in_docker:
            if self._ssh_conn is None:
                raise ConnectionError(
                    "Local machine is not available. In Docker mode, SSH to "
                    "the host must be configured, or the Locus Host Agent "
                    "must be running."
                )
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
        """Get local machine status.

        Returns "online" when the host is reachable (agent, native mode, or
        Docker with SSH), "needs_setup" when in Docker without SSH or agent.
        """
        if self._agent_available:
            return "online"
        if not self._in_docker:
            return "online"
        if self._ssh_conn is not None:
            return "online"
        return "needs_setup"

    async def _connect_to_host(self) -> None:
        """SSH to the Docker host via host.docker.internal."""
        import asyncssh

        host = settings.local_ssh_host
        port = settings.local_ssh_port
        username = settings.local_ssh_user
        key_path = settings.local_ssh_key

        if not username or not key_path:
            logger.warning(
                "Local machine SSH not configured -- status is 'needs_setup'. "
                "Set LOCUS_LOCAL_SSH_USER and LOCUS_LOCAL_SSH_KEY for "
                "Docker-to-host access, or install the Locus Host Agent."
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
            logger.warning(
                "Local machine: SSH to host failed -- status is 'needs_setup': %s",
                exc,
            )
            self._ssh_conn = None

    async def shutdown(self) -> None:
        """Close agent client and SSH connection. Called from FastAPI lifespan."""
        if self._agent_client:
            try:
                await self._agent_client.close()
            except Exception:
                pass
            self._agent_client = None
            self._agent_available = False
            logger.info("Local machine: agent client closed")

        if self._ssh_conn:
            self._ssh_conn.close()
            try:
                await self._ssh_conn.wait_closed()
            except Exception:
                pass
            self._ssh_conn = None
            logger.info("Local machine: SSH connection closed")


local_machine_manager = LocalMachineManager()
