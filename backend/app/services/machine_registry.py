"""Unified machine registry for local and remote machine access.

Provides a single lookup interface that routes operations to either
the LocalMachineManager (for machine_id="local") or the SSHManager
(for remote machines stored in the database).
"""

from __future__ import annotations

from app.local.manager import LOCAL_MACHINE_ID, local_machine_manager
from app.ssh.manager import ssh_manager


async def get_connection_for_machine(machine_id: str):
    """Get connection for any machine (local or remote).

    For the local machine:
        - Returns AsyncSSH connection if running in Docker
        - Returns None if running natively (sentinel for subprocess path)

    For remote machines:
        - Returns AsyncSSH connection or None if not connected
    """
    if machine_id == LOCAL_MACHINE_ID:
        return await local_machine_manager.get_connection()
    return await ssh_manager.get_connection(machine_id)


def get_machine_status(machine_id: str) -> str:
    """Get status for any machine.

    Returns:
        One of "online", "offline", "reconnecting", or "needs_setup".
        Local machine is "online" when host is reachable, "needs_setup"
        when in Docker mode without SSH.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return local_machine_manager.get_status()
    return ssh_manager.get_status(machine_id)


def is_local_machine(machine_id: str) -> bool:
    """Check if a machine_id refers to the local machine."""
    return machine_id == LOCAL_MACHINE_ID


async def run_command_on_machine(machine_id: str, command: str) -> str:
    """Run a command on any machine and return stdout.

    Routes to LocalMachineManager.run_command() for the local machine,
    or executes via SSH connection for remote machines.  Remote commands
    go through the SSH manager's concurrency limiter and auto-reconnect.
    """
    if machine_id == LOCAL_MACHINE_ID:
        return await local_machine_manager.run_command(command)

    result = await ssh_manager.run(machine_id, command, check=True)
    return result.stdout
