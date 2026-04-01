"""Agent auto-deploy pipeline: detect, deploy, and manage host agents via SSH.

Handles platform detection (Linux/macOS/Windows), Python interpreter discovery,
SCP-based .pyz upload, background agent startup, health polling, and version-based
re-deployment.
"""

from __future__ import annotations

import asyncio
import logging
import os

import asyncssh
import httpx

logger = logging.getLogger(__name__)

# Remote directory where agent files are stored
AGENT_DIR = "~/.locus-agent"

# Default agent HTTP port
AGENT_PORT = 7700

# Directory inside Docker image containing pre-built .pyz files
AGENT_PYZ_DIR = "/app/agents"

# Health polling settings
_HEALTH_POLL_INTERVAL = 0.5  # seconds
_HEALTH_POLL_TIMEOUT = 10.0  # seconds


async def detect_platform(ssh_conn: asyncssh.SSHClientConnection) -> str:
    """Detect the remote machine's OS platform via SSH.

    Returns:
        Platform string: "linux-x64", "darwin-arm64", "darwin-x64", or "win-x64".

    Raises:
        RuntimeError: If platform cannot be determined.
    """
    result = await ssh_conn.run("uname -s 2>/dev/null || echo Windows", check=False)
    os_name = (result.stdout or "").strip()

    if os_name == "Linux":
        return "linux-x64"
    elif os_name == "Darwin":
        # Distinguish Apple Silicon vs Intel
        arch_result = await ssh_conn.run("uname -m", check=False)
        arch = (arch_result.stdout or "").strip()
        if arch == "arm64":
            return "darwin-arm64"
        return "darwin-x64"
    elif os_name == "Windows":
        return "win-x64"
    else:
        raise RuntimeError(f"Unknown platform: {os_name}")


async def detect_python(ssh_conn: asyncssh.SSHClientConnection) -> str | None:
    """Find a suitable Python 3.12+ interpreter on the remote machine.

    Tries python3, python, and py -3 (Windows) in order.

    Returns:
        The command name (e.g. "python3") or None if no suitable Python found.
    """
    candidates = ["python3", "python", "py -3"]

    for cmd in candidates:
        try:
            result = await ssh_conn.run(f"{cmd} --version 2>&1", check=False)
            output = (result.stdout or "").strip()
            if output.startswith("Python 3."):
                # Check version >= 3.12
                parts = output.split()
                if len(parts) >= 2:
                    version_str = parts[1]
                    version_parts = version_str.split(".")
                    if len(version_parts) >= 2:
                        major = int(version_parts[0])
                        minor = int(version_parts[1])
                        if major == 3 and minor >= 12:
                            logger.debug("Found Python: %s -> %s", cmd, output)
                            return cmd.split()[0] if " " not in cmd else cmd
        except Exception:
            continue

    return None


async def probe_agent(base_url: str, token: str | None = None) -> dict | None:
    """Probe a running agent at the given URL.

    Args:
        base_url: Agent base URL (e.g. "http://192.168.1.10:7700").
        token: Optional auth token to verify authenticated access.

    Returns:
        Health response dict if agent is running, None otherwise.
    """
    try:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{base_url}/health", headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.ConnectTimeout, OSError):
        pass
    except Exception as exc:
        logger.debug("Agent probe failed at %s: %s", base_url, exc)

    return None


async def deploy_agent(
    ssh_conn: asyncssh.SSHClientConnection,
    platform: str | None = None,
    port: int = AGENT_PORT,
) -> tuple[str, str]:
    """Deploy the Locus agent to a remote machine via SCP + SSH.

    Steps:
    1. Detect platform (if not provided)
    2. Detect Python interpreter
    3. Create remote directory
    4. SCP the correct .pyz file
    5. Start agent in background
    6. Poll /health until agent is online
    7. Read auth token from agent.token file

    Args:
        ssh_conn: Active SSH connection to the target machine.
        platform: Platform string (e.g. "linux-x64"). Auto-detected if None.
        port: Agent port (default 7700).

    Returns:
        Tuple of (base_url, token).

    Raises:
        RuntimeError: If Python not found or agent fails to start.
    """
    # Step 1: Detect platform
    if platform is None:
        platform = await detect_platform(ssh_conn)
    logger.info("DEPLOY: Platform detected as %s", platform)

    # Step 2: Detect Python
    python_cmd = await detect_python(ssh_conn)
    if python_cmd is None:
        raise RuntimeError(
            "No suitable Python 3.12+ found on remote machine. "
            "Tried: python3, python, py -3"
        )
    logger.info("DEPLOY: Using Python command: %s", python_cmd)

    # Step 3: Create remote directory
    await ssh_conn.run(f"mkdir -p {AGENT_DIR}", check=True)

    # Step 4: SCP correct .pyz file
    pyz_name = f"locus-agent-{platform}.pyz"
    local_path = os.path.join(AGENT_PYZ_DIR, pyz_name)

    if not os.path.exists(local_path):
        raise RuntimeError(
            f"Agent .pyz not found at {local_path}. "
            f"Ensure agent is built for platform '{platform}'."
        )

    remote_path = f"{AGENT_DIR}/{pyz_name}"
    await asyncssh.scp(local_path, (ssh_conn, remote_path))
    logger.info("DEPLOY: Uploaded %s to %s", pyz_name, remote_path)

    # Step 5: Start agent in background
    is_windows = platform.startswith("win")
    if is_windows:
        start_cmd = (
            f"Start-Process -NoNewWindow {python_cmd} "
            f"-ArgumentList '{remote_path}','start','--port','{port}'"
        )
    else:
        start_cmd = (
            f"nohup {python_cmd} {remote_path} start --port {port} "
            f"> {AGENT_DIR}/agent.log 2>&1 &"
        )

    await ssh_conn.run(start_cmd, check=False)
    logger.info("DEPLOY: Started agent with: %s", start_cmd)

    # Step 6: Wait for agent to come online
    # Determine host from SSH connection
    host = _extract_host(ssh_conn)
    base_url = f"http://{host}:{port}"

    health = await _poll_health(base_url, timeout=_HEALTH_POLL_TIMEOUT)
    if health is None:
        raise RuntimeError(
            f"Agent failed to start within {_HEALTH_POLL_TIMEOUT}s at {base_url}. "
            f"Check {AGENT_DIR}/agent.log on the remote machine."
        )
    logger.info("DEPLOY: Agent online at %s (version=%s)", base_url, health.get("version"))

    # Step 7: Read token
    token_result = await ssh_conn.run(f"cat {AGENT_DIR}/agent.token", check=True)
    token = (token_result.stdout or "").strip()

    if not token:
        raise RuntimeError("Agent started but token file is empty or missing.")

    return base_url, token


async def ensure_agent(
    ssh_conn: asyncssh.SSHClientConnection,
    host: str,
    port: int = AGENT_PORT,
    expected_version: str | None = None,
) -> tuple[str, str]:
    """Ensure an agent is running on the remote machine, deploying if needed.

    Probes the agent first. If running and version matches, returns existing
    connection info. If version mismatches or agent is not running, deploys.

    Args:
        ssh_conn: Active SSH connection.
        host: Remote host address.
        port: Agent port.
        expected_version: Expected agent version. If None, any version is accepted.

    Returns:
        Tuple of (base_url, token).
    """
    base_url = f"http://{host}:{port}"

    # Try to read existing token
    token = await _read_token(ssh_conn)

    # Probe existing agent
    health = await probe_agent(base_url, token=token)

    if health is not None:
        # Agent is running
        if expected_version is None or health.get("version") == expected_version:
            # Version matches or no version requirement
            if token:
                logger.info(
                    "DEPLOY: Agent already running at %s (version=%s)",
                    base_url,
                    health.get("version"),
                )
                return base_url, token
            # No token but agent is running -- read it
            token = await _read_token(ssh_conn)
            if token:
                return base_url, token

        # Version mismatch -- stop old agent and re-deploy
        logger.info(
            "DEPLOY: Version mismatch (running=%s, expected=%s), re-deploying",
            health.get("version"),
            expected_version,
        )
        await _stop_agent(ssh_conn)

    # Deploy fresh agent
    return await deploy_agent(ssh_conn, port=port)


async def _poll_health(base_url: str, timeout: float = _HEALTH_POLL_TIMEOUT) -> dict | None:
    """Poll agent /health endpoint until it responds or timeout."""
    elapsed = 0.0
    while elapsed < timeout:
        health = await probe_agent(base_url)
        if health is not None:
            return health
        await asyncio.sleep(_HEALTH_POLL_INTERVAL)
        elapsed += _HEALTH_POLL_INTERVAL
    return None


async def _read_token(ssh_conn: asyncssh.SSHClientConnection) -> str | None:
    """Read agent token from remote machine, returning None if not found."""
    try:
        result = await ssh_conn.run(f"cat {AGENT_DIR}/agent.token 2>/dev/null", check=False)
        token = (result.stdout or "").strip()
        return token if token else None
    except Exception:
        return None


async def _stop_agent(ssh_conn: asyncssh.SSHClientConnection) -> None:
    """Stop a running agent on the remote machine."""
    python_cmd = await detect_python(ssh_conn)
    if python_cmd is None:
        # Try brute-force kill via PID file or pkill
        await ssh_conn.run(f"pkill -f 'locus-agent.*start' 2>/dev/null || true", check=False)
        await asyncio.sleep(1)
        return

    # Try graceful stop via the .pyz
    await ssh_conn.run(
        f"{python_cmd} {AGENT_DIR}/locus-agent-*.pyz stop 2>/dev/null || true",
        check=False,
    )
    await asyncio.sleep(1)
    logger.info("DEPLOY: Stopped existing agent")


def _extract_host(ssh_conn: asyncssh.SSHClientConnection) -> str:
    """Extract the remote host address from an SSH connection."""
    # asyncssh stores the peer address
    try:
        peername = ssh_conn.get_extra_info("peername")
        if peername:
            return peername[0]  # (host, port) tuple
    except Exception:
        pass
    # Fallback -- this shouldn't normally happen
    return "127.0.0.1"
