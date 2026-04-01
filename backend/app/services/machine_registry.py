"""Unified machine registry for local and remote machine access.

Provides a single lookup interface that routes operations to either
the LocalMachineManager (for machine_id="local") or the SSHManager
(for remote machines stored in the database).

Supports agent-backed machines: when a host agent is available,
get_agent_client_for_machine() returns an AgentClient for direct
terminal/command access without SSH.
"""

from __future__ import annotations

from app.agent.client import AgentClient
from app.local.manager import LOCAL_MACHINE_ID, local_machine_manager
from app.ssh.manager import ssh_manager


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

    Currently only the local machine supports agent-based access.
    Remote machine agent support will come in a future phase.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return local_machine_manager.agent_client
    # Remote machines: agent support not yet implemented
    return None


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
    """
    if machine_id == LOCAL_MACHINE_ID:
        return await local_machine_manager.run_command(command)

    result = await ssh_manager.run(machine_id, command, check=True)
    return result.stdout
