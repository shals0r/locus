"""Command execution via agent REST API.

Thin wrapper around AgentClient.run_command for use by services
that need to run host commands through the agent.
"""

from __future__ import annotations

from app.agent.client import AgentClient


async def run_command_via_agent(agent_client: AgentClient, command: str) -> str:
    """Run a command on the agent host and return stdout.

    Delegates to AgentClient.run_command which POSTs to /exec.

    Args:
        agent_client: An active AgentClient instance.
        command: Shell command to execute.

    Returns:
        stdout string from the command.
    """
    return await agent_client.run_command(command)
