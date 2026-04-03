"""Unified machine registry for local and remote machine access.

Provides a single lookup interface that routes operations to either
the LocalMachineManager (for machine_id="local") or the SSHManager
(for remote machines stored in the database).

Supports agent-backed machines: when a host agent is available,
get_agent_client_for_machine() returns an AgentClient for direct
terminal/command access without SSH.
"""

from __future__ import annotations

import logging

from app.agent.client import AgentClient
from app.local.manager import LOCAL_MACHINE_ID, local_machine_manager
from app.ssh.manager import ssh_manager

logger = logging.getLogger(__name__)

# Remote agent clients, keyed by machine_id.
# Populated when agents are deployed to remote machines via SSH.
_remote_agent_clients: dict[str, AgentClient] = {}


async def register_agent_client(machine_id: str, base_url: str, token: str) -> AgentClient:
    """Register (or replace) a remote agent client for a machine.

    If an existing client is registered for this machine_id, it is
    closed before the new one is stored.

    Returns:
        The newly created AgentClient.
    """
    existing = _remote_agent_clients.get(machine_id)
    if existing is not None:
        try:
            await existing.close()
        except Exception:
            pass
        logger.debug("Replaced existing agent client for machine %s", machine_id)

    client = AgentClient(base_url, token)
    _remote_agent_clients[machine_id] = client
    logger.info("Registered agent client for machine %s at %s", machine_id, base_url)
    return client


async def unregister_agent_client(machine_id: str) -> None:
    """Remove and close a remote agent client for a machine.

    No-op if no client is registered for the given machine_id.
    """
    client = _remote_agent_clients.pop(machine_id, None)
    if client is not None:
        try:
            await client.close()
        except Exception:
            pass
        logger.info("Unregistered agent client for machine %s", machine_id)


async def get_connection_for_machine(machine_id: str):
    """Get connection for any machine (local or remote).

    For the local machine:
        - Returns AsyncSSH connection if running in Docker
        - Returns None if running natively (sentinel for subprocess path)

    For remote machines:
        - Returns AsyncSSH connection or None if not connected

    Note: When agent is available for a machine, prefer
    get_agent_client_for_machine() instead -- it bypasses SSH entirely.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return await local_machine_manager.get_connection()
    return await ssh_manager.get_connection(machine_id)


async def get_agent_client_for_machine(machine_id: str) -> AgentClient | None:
    """Get an AgentClient for the given machine, if an agent is available.

    Returns:
        AgentClient if the machine has an agent running, None otherwise.

    Checks local machine agent first, then remote agent clients.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return local_machine_manager.agent_client
    return _remote_agent_clients.get(machine_id)


def get_machine_status(machine_id: str) -> str:
    """Get status for any machine.

    Returns:
        One of "online", "offline", "reconnecting", or "needs_setup".
        Local machine is "online" when host is reachable, "needs_setup"
        when in Docker mode without SSH or agent.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return local_machine_manager.get_status()
    return ssh_manager.get_status(machine_id)


def is_local_machine(machine_id: str) -> bool:
    """Check if a machine_id refers to the local machine."""
    return machine_id == LOCAL_MACHINE_ID


async def run_command_on_machine(machine_id: str, command: str) -> str:
    """Run a command on any machine and return stdout.

    Routes to LocalMachineManager.run_command() for the local machine
    (which prefers agent over SSH over subprocess),
    or executes via SSH connection for remote machines.

    For remote machines, prefers the agent HTTP API when available,
    falling back to SSH exec.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return await local_machine_manager.run_command(command)

    # Prefer agent client if registered for this machine
    agent_client = _remote_agent_clients.get(machine_id)
    if agent_client is not None:
        try:
            return await agent_client.run_command(command)
        except Exception as exc:
            logger.warning(
                "Agent command failed for machine %s, falling back to SSH: %s",
                machine_id,
                exc,
            )

    result = await ssh_manager.run(machine_id, command, check=True)
    return result.stdout
